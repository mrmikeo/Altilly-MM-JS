# Altilly-Market-Maker-JS
Market making bot for Altilly, written in JavaScript.  I use NodeJS v10 for this, but it will likely work fine on any version > 9

**Install Nodejs v10**
```
curl -sL https://deb.nodesource.com/setup_10.x | sudo -E bash -
apt-get install -y nodejs
```

**To Install:**
```
git clone https://github.com/mrmikeo/Altilly-Market-Maker-JS
cd Altilly-Market-Maker-JS
chmod u+x ./install.sh
./install.sh
```

**Quick start:**
```
./altilly_market_maker_js.sh --apiKey=<your API Key> --apiSecret=<your API Secret> --spread=3 --baseexposure=2 --stockexposure=2 --base=BTC --stock=ETH --pingpong=0
```

A good place to run this is from a screen session:
```
screen -S MM_BTC_USDT
```

**Parameters**

`./altilly_market_maker_js.sh` takes in 8 required arguments;
* `--apiKey=`: Your API Key
* `--apiSecret=`: Your API Secret
* `--spread=`: The spread percentage on the asset you would like to market make on
* `--baseexposure= or -be=`: The maximum percentage of your base account you want in the order book at any given time
* `--stockexposure= or -se=`: The maximum percentage of your stock ccount you want in the order book at any given time
* `--base= or -b=`: The base asset (e.g. in ETHBTC, BTC is the base asset)
* `--stock= or -s=`: The stock asset (e.g. in ETHBTC, ETH is the stock asset)
* `--pingpong=`: 
0 = place orders on both sides always
1 = alternate buy and sell orders (ie, when you sell, then the next order will be buy)
2 = double spread on last traded side (ie, when you sell, your next sell order will have 2x the spacing)
* `--numorders=`: How many orders do you want to place on each side. They will spread evenly according to your spread settings and quantity is exposure divided by numorders


### How it works

The bot will maintain a spread of a given percentage in the order book, based on the last price traded (or median price of best buy/sell if last price exceeds those boundaries).
It will recalculate the spread and orders, when either your buy or sell maker order gets filled or partially filled, or if there is a disconnect between your bot and the Websockets API.

For example given an order book that looks this;
```
16.8	| -- (your order) (s_1)
15.8	| -- sell orders
15.7	|

15.5 	| -- Last price traded

14.5	| -- (your order) (b_1)
14.124 	| -- buy orders 
12.5	|

``` 

If someone then does a single market buy up to 17, b_1 will be canceled, s_1 will be filled, and the bot will then rebalance so that the new order book looks like this;

```
18.00	| -- (your new order) (s_2)

17.00	| -- Last price traded

16.00	| -- (your new order) (b_2)
14.124 	| -- buy orders 
12.5	|

```

The amount in each order is dependent on the `--baseexposure=` && `--stockexposure=` parameters. It will calculate the total {stock | base} balance * (stockexposure | baseexposure / 100).
For example;

```
Exposure percentage (be/se) = 1
Base asset balance (b) = 10
Stock asset balance (s) = 15

buy order amount = b(10) * (be(1) / 100)
sell order amount = s(15) * (se(1) / 100)  
```
