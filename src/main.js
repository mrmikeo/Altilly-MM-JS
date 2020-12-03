const altillyApi 		= require('nodeAltillyApi');
const argv 				= require('yargs').argv
const crypto 			= require('crypto');
const WebSocket 		= require('ws');
const { v4: uuidv4 } 	= require('uuid');
const Big 				= require('big.js');
const { onShutdown } 	= require('node-graceful-shutdown');


const opts = {
    apiKey: argv.apiKey,            	/// API key
    apiSecret: argv.apiSecret,      	/// API secret
    spread: argv.spread / 100,      	/// Spread to maintain
    baseexposure: argv.baseexposure / 100,  /// Amount of base account to have exposed at a given time
    stockexposure: argv.stockexposure / 100,  /// Amount of stock account to have exposed at a given time
    basemax: argv.basemax,                	/// Max Qty can use for base exposure
    stockmax: argv.stockmax,               	/// Max Qty can use for stock exposre
    base: argv.base,                	/// Base asset to use e.g. BTC for BTCETH
    stock: argv.stock,               	/// Stock to use e.g. ETH for BTCETH
    pingpong: parseInt(argv.pingpong),			/// 0 = place orders on both sides always, 1 = alternate buy and sell orders, 2 = double spread on last traded side
    numorders: parseInt(argv.numorders)	/// Number of orders per side
}

// Get the command line args and save into opts
Object.keys(opts).forEach(key => {
    if (opts[key] === undefined) {
        console.log(`
            ${key} must be passed into the program
            e.g. node . run --${key}=<value>
            `)
        process.exit(1);
    }
});

console.log(
    `
        Running market maker with the following options;
        Spread: ${opts.spread}
        Base Exposure: ${opts.baseexposure}
        Stock Exposure: ${opts.stockexposure}
        Base Max: ${opts.basemax}
        Stock Max: ${opts.stockmax}
        Base Asset: ${opts.base}
        Stock Asset: ${opts.stock}
        Ping-Pong: ${opts.pingpong}
        NumOrders: ${opts.numorders}
    `)

const restapi = new altillyApi.default(opts.apiKey, opts.apiSecret);

restapi.cancelAllMarketOrders(opts.stock + opts.base);

var lastPrice = 0;
var is_initialised = false;
var rebalancing = false;
var lastTradeSide = null;

runIt();

// On Shutdown - Cancel open orders
onShutdown("main", async function () {

  return new Promise((resolve, reject) => {

    (async () => {
			
      var apiresp = await restapi.cancelAllMarketOrders(opts.stock + opts.base);
					
      console.log('Cancel open orders');

      resolve(apiresp);
				
    })();
			
  });
	
});


function runIt()
{

	var ws = new WebSocket('wss://wsapi.altilly.com:2096');

	ws.on('open', function open() {

	  console.log('connected ws');
	  doSubscribe(ws);
  
	});

	ws.on('close', function close() {

	  console.log('disconnected');
  
	  restapi.cancelAllMarketOrders(opts.stock + opts.base);
  
  	  is_initialised = false;
  	  
	  setTimeout(function() {
		runIt();
	  },5000);
  
	});

	setInterval(function() {

		ws.ping();

	},5000);

	ws.on('pong', function() {

		//console.log('pong');

	});

	ws.on('message', async function incoming(data) {

	  if (data !== undefined)
	  {

		var data = JSON.parse(data);
	
		if (data.params && data.params.symbol && data.params.symbol == opts.stock + opts.base)
		{
  
		  if (data.method == "ticker")
		  { 
	
			if (Big(data.params.last).lt(data.params.bid) || Big(data.params.last).gt(data.params.ask))
			{
	  
	  		  if (data.params.bid > 0 && data.params.ask > 0)
	  		  {
			  	lastPrice = parseFloat(Big(data.params.bid).plus(data.params.ask).div(2).toFixed(10));
			  }
			  else if (data.params.bid > 0)
			  {
			  	lastPrice = parseFloat(data.params.bid);
			  }
			  else if (data.params.ask > 0)
			  {
			  	lastPrice = parseFloat(data.params.ask);
			  }
			  
			}
			else
			{
  
			  lastPrice = parseFloat(data.params.last);
		
			}

			if (!is_initialised) {
			  initialise();
			  is_initialised = true;
			}
  
		  }
		  else if (data.method == "report")
		  {
	
			console.log(data);
  
			if ((data.params.status === "partly filled" || data.params.status === "filled") && !rebalancing) { // Make sure we have async behaviour to avoid conflict
			  rebalancing = true;
			  lastTradeSide = data.params.side;
			  await cancel_all();
			  await sleep(2000);
			  await recalculate_and_enter();
			  rebalancing = false;
			}
  
		  }
	
		}
	
	  }
  
	});

}

function doSubscribe(thisws)
{

  console.log('Do Subsribe');
  
  thisws.send(JSON.stringify({"method": "login","params": {"algo": "BASIC","pKey": opts.apiKey,"sKey": opts.apiSecret}}));

  // Stream the current price
  // Save into a global variable

  thisws.send(JSON.stringify({"method":"subscribeTicker","params":{"symbol":opts.stock + opts.base}}));

  // Listen to our trades
  // If one of our buys gets filled, then cancel all orders 
  // and enter new orders with a recalculated spread

  thisws.send(JSON.stringify({"method":"subscribeReports","params":{}}));
  
}

async function cancel_all() {
    await restapi.cancelAllMarketOrders(opts.stock + opts.base);
}

// Enter a buy order with n% from account (y/2)% away from the last price
// Enter a sell order with n% from accoutn (y/2)% away from the last price

async function recalculate_and_enter() {

    let account_info = await restapi.getTradingBalances();

	var balances = {};
	for (let i = 0; i < account_info.length; i++)
	{
	
		var thisitem = account_info[i];
		
		balances[thisitem.currency] = thisitem.available;

	}

    let base_balance = parseFloat(balances[opts.base]);
    let stock_balance = parseFloat(balances[opts.stock]);

	let sell_price = null;
	let buy_price = null;

    if (opts.pingpong == 2)
    {
    
      if (lastTradeSide == 'buy')
      {

        sell_price = (lastPrice + (lastPrice * (opts.spread / 2))).toFixed(10);
        buy_price = (lastPrice - (lastPrice * (opts.spread))).toFixed(10);
      
      }
      else if (lastTradeSide == 'sell')
      {

        sell_price = (lastPrice + (lastPrice * (opts.spread))).toFixed(10);
        buy_price = (lastPrice - (lastPrice * (opts.spread / 2))).toFixed(10);
      
      }
      else /// Null
      {

        sell_price = (lastPrice + (lastPrice * (opts.spread / 2))).toFixed(10);
        buy_price = (lastPrice - (lastPrice * (opts.spread / 2))).toFixed(10);
      
      }
    
    }
    else
    {

      sell_price = (lastPrice + (lastPrice * (opts.spread / 2))).toFixed(10);
      buy_price = (lastPrice - (lastPrice * (opts.spread / 2))).toFixed(10);
    
    }

    let quantity_stock = (stock_balance * opts.stockexposure / opts.numorders).toFixed(3);
    let quantity_base = ((base_balance * opts.baseexposure / opts.numorders)/buy_price).toFixed(3);
    
    if (stock_balance * opts.stockexposure > opts.stockmax)
    {
    	quantity_stock = (opts.stockmax / opts.numorders).toFixed(3);
    }

    if (base_balance * opts.baseexposure > opts.basemax)
    {
    	quantity_base = ((opts.basemax / opts.numorders)/buy_price).toFixed(3);
    }

    console.log(
        `
        Entering orders:
            Buy amount (${opts.stock}): ${quantity_base}
            Buy price (${opts.base}): ${buy_price}

            Sell amount (${opts.stock}): ${quantity_stock}
            Sell price (${opts.base}): ${sell_price}

            Last Price: ${lastPrice} 
            
            Num Orders: ${opts.numorders} 
        `)

    if (opts.pingpong == 1)
    {
    
      if (lastTradeSide == 'sell' || lastTradeSide == null)
      {
      
      	for (let i = 0; i < opts.numorders; i++)
      	{

    		let uuid = uuidv4();
    	
    		let side = 'buy';
    	
        	await restapi.createOrder(uuid, opts.stock + opts.base, side, type = 'limit', timeInForce = 'GTC', side === "buy" ? quantity_base :  quantity_stock, side === "buy" ? buy_price : sell_price);
      
      		buy_price = (parseFloat(buy_price) - (parseFloat(buy_price) * (opts.spread / 2))).toFixed(10);
      
      	}
      
      }
      else
      {

      	for (let i = 0; i < opts.numorders; i++)
      	{
      	
    		let uuid = uuidv4();
    	
    		let side = 'sell';
    	
        	await restapi.createOrder(uuid, opts.stock + opts.base, side, type = 'limit', timeInForce = 'GTC', side === "buy" ? quantity_base :  quantity_stock, side === "buy" ? buy_price : sell_price);

			sell_price = (parseFloat(sell_price) + (parseFloat(sell_price) * (opts.spread / 2))).toFixed(10);
      
      	}
      	
      }
    
    }
    else
    {

      for (const side of ["buy", "sell"]) {

      	for (let i = 0; i < opts.numorders; i++)
      	{
      	
    		let uuid = uuidv4();
    	
        	await restapi.createOrder(uuid, opts.stock + opts.base, side, type = 'limit', timeInForce = 'GTC', side === "buy" ? quantity_base :  quantity_stock, side === "buy" ? buy_price : sell_price);

			if (side == 'buy')
			{
				buy_price = (parseFloat(buy_price) - (parseFloat(buy_price) * (opts.spread / 2))).toFixed(10);
			}
			else
			{
				sell_price = (parseFloat(sell_price) + (parseFloat(sell_price) * (opts.spread / 2))).toFixed(10);
			}
			
		}
		
      }
    
    }

}

function initialise() {
    console.log("Initialising...")
    recalculate_and_enter();
}

function sleep(ms) {
  return new Promise(
    resolve => setTimeout(resolve, ms)
  );
}
