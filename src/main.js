const altillyApi = require('nodeAltillyApi');
const argv = require('yargs').argv
const crypto = require('crypto');
const WebSocket = require('ws');

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

/*
const client = Binance({
  apiKey: opts.apiKey,
  apiSecret: opts.apiSecret
});
*/

const restapi = new altillyApi.default(opts.apiKey, opts.apiSecret);

let lastPrice = 0;
let is_initialised = false;
let rebalancing = false;

ws.on('open', function open() {

  console.log('connected ws');
  
  doStuff();
  
});

ws.on('close', function close() {
  console.log('disconnected');
});

ws.on('message', function incoming(data) {

  var data = JSON.parse(data);
  
  if (data.method == "ticker")
  {
  
  	lastPrice = parseFloat(data.last);

    if (!is_initialised) {
	  initialise();
      is_initialised = true;
    }
  
  }
  else if (data.method == "report")
  {
  
    if ((data.params.status === "partly filled" || data.params.status === "filled") && !rebalancing) { // Make sure we have async behaviour to avoid conflict
        rebalancing = true;
        await cancel_all();
        await recalculate_and_enter();
        rebalancing = false;
    }
  
  }
  
  
});

function doStuff()
{

  ws.send(JSON.stringify({"method": "login","params": {"algo": "BASIC","pKey": opts.apiKey,"sKey": opts.apiSecret}}));

  // Stream the current price
  // Save into a global variable

  ws.send(JSON.stringify({"method":"subscribeTicker","params":{"symbol":opts.stock + opts.base}}));

  // Listen to our trades
  // If one of our buys gets filled, then cancel all orders 
  // and enter new orders with a recalculated spread

  ws.send(JSON.stringify({"method":"subscribeReports","params":{}}));
}



// Stream the current price
// Save into a global variable
/*
let lastPrice = 0;
let is_initialised = false;
client.ws.trades(opts.stock + opts.base, trade => {
  lastPrice = parseFloat(trade.price);
  
  // Initialise the market maker bot; This just runs 
  // recalculate_and_enter() so that we have starter orders
  if (!is_initialised) {
    initialise();
    is_initialised = true;
  }
});
*/

const orders = {
    "buy": [],
    "sell": [],
};

// Listen to our trades
// If one of our buys gets filled, then cancel all orders 
// and enter new orders with a recalculated spread

/*
let rebalancing = false;
client.ws.user(async (msg) => {
    if (msg.eventType === "executionReport") {
        if ((msg.orderStatus === "partly filled" ||
                msg.orderStatus === "filled") && !rebalancing) { // Make sure we have async behaviour to avoid conflict
            rebalancing = true;
            await cancel_all();
            await recalculate_and_enter();
            rebalancing = false;
        }
    }
});
*/



async function cancel_all() {
    await Object.keys(orders).forEach(order => {
    
    	client.cancelOrderById(order.uuid);
    
    /*
        client.cancelOrder({
            symbol: order.symbol,
            orderId: order.orderId,
        });
    */
    });
}

// Enter a buy order with n% from account (y/2)% away from the last price
// Enter a sell order with n% from accoutn (y/2)% away from the last price
async function recalculate_and_enter() {
    const account_info = await client.getTradingBalances();
    
    const base_balance = parseFloat(account_info.find(asset_obj => asset_obj.currency == opts.base).available);
    const stock_balance = parseFloat(account_info.find(asset_obj => asset_obj.currency == opts.stock).available);

    const quantity_stock = (stock_balance * opts.exposure).toFixed(5);
    const quantity_base = (base_balance * opts.exposure).toFixed(5);
    
    const sell_price = (lastPrice + (lastPrice * (opts.spread / 2))).toFixed(5);
    const buy_price = (lastPrice - (lastPrice * (opts.spread / 2))).toFixed(5)

    console.log(
        `
        Entering orders:
            Buy amount (${opts.base}): ${quantity_base}
            Buy price (${opts.base}): ${buy_price}

            Sell amount (${opts.stock}): ${quantity_stock}
            Sell price (${opts.stock}): ${sell_price}

            Last Price: ${lastPrice} 
        `)

    for (const side of ["buy", "sell"]) {
        orders[side].push(await client.createOrder(null, opts.stock + opts.base, side, type = 'limit', timeInForce = 'GTC', side === "buy" ? quantity_base :  quantity_stock, side === "buy" ? buy_price : sell_price));
        
        /*
        {
            symbol: opts.stock + opts.base,
            side,
            quantity: side === "buy" ? quantity_base :  quantity_stock,
            price: side === "buy" ? buy_price : sell_price,
        }));
        */
    }

}

function initialise() {
    console.log("Initialising...")
    recalculate_and_enter();
}
