const altillyApi = require('nodeAltillyApi');
const argv = require('yargs').argv
const crypto = require('crypto');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');

const ws = new WebSocket('wss://wsapi.altilly.com:2096');

const opts = {
    apiKey: argv.apiKey,            /// API key
    apiSecret: argv.apiSecret,      /// API secret
    spread: argv.spread / 100,      /// Spread to maintain
    exposure: argv.exposure / 100,  /// Amount of account to have exposed at a given time
    base: argv.base,                /// Base asset to use e.g. BTC for BTCETH
    stock: argv.stock               /// Stock to use e.g. ETH for BTCETH
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
        Exposure: ${opts.exposure}
        Base Asset: ${opts.base}
        Stock Asset: ${opts.stock}
    `)

const restapi = new altillyApi.default(opts.apiKey, opts.apiSecret);

restapi.cancelAllMarketOrders(opts.stock + opts.base);

let lastPrice = 0;
let is_initialised = false;
let rebalancing = false;

ws.on('open', function open() {

  console.log('connected ws');
  doSubscribe();
  
});

ws.on('close', function close() {

  console.log('disconnected');
  
  restapi.cancelAllMarketOrders(opts.stock + opts.base);
  
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
  
    if (data.method == "ticker")
    {
  
  	  lastPrice = parseFloat(data.params.last);

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
        await cancel_all();
        await sleep(2000);
        await recalculate_and_enter();
        rebalancing = false;
      }
  
    }
    
  }
  
});

function doSubscribe()
{

  console.log('Do Subsribe');
  
  ws.send(JSON.stringify({"method": "login","params": {"algo": "BASIC","pKey": opts.apiKey,"sKey": opts.apiSecret}}));

  // Stream the current price
  // Save into a global variable

  ws.send(JSON.stringify({"method":"subscribeTicker","params":{"symbol":opts.stock + opts.base}}));

  // Listen to our trades
  // If one of our buys gets filled, then cancel all orders 
  // and enter new orders with a recalculated spread

  ws.send(JSON.stringify({"method":"subscribeReports","params":{}}));
  
}

async function cancel_all() {
    await restapi.cancelAllMarketOrders(opts.stock + opts.base);
}

// Enter a buy order with n% from account (y/2)% away from the last price
// Enter a sell order with n% from accoutn (y/2)% away from the last price

async function recalculate_and_enter() {

    const account_info = await restapi.getTradingBalances();

	var balances = {};
	for (let i = 0; i < account_info.length; i++)
	{
	
		var thisitem = account_info[i];
		
		balances[thisitem.currency] = thisitem.available;

	}

    const base_balance = parseFloat(balances[opts.base]);
    const stock_balance = parseFloat(balances[opts.stock]);

    const sell_price = (lastPrice + (lastPrice * (opts.spread / 2))).toFixed(8);
    const buy_price = (lastPrice - (lastPrice * (opts.spread / 2))).toFixed(8);
    
    const quantity_stock = (stock_balance * opts.exposure).toFixed(3);
    const quantity_base = ((base_balance * opts.exposure)/buy_price).toFixed(3);

    console.log(
        `
        Entering orders:
            Buy amount (${opts.stock}): ${quantity_base}
            Buy price (${opts.base}): ${buy_price}

            Sell amount (${opts.stock}): ${quantity_stock}
            Sell price (${opts.base}): ${sell_price}

            Last Price: ${lastPrice} 
        `)

    for (const side of ["buy", "sell"]) {
    
    	var uuid = uuidv4();
    	
        await restapi.createOrder(uuid, opts.stock + opts.base, side, type = 'limit', timeInForce = 'GTC', side === "buy" ? quantity_base :  quantity_stock, side === "buy" ? buy_price : sell_price);

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
