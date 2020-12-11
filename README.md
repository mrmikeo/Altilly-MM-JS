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
./altilly_market_maker_js.sh --apiKey=<your API Key> --apiSecret=<your API Secret> --spread=3 --baseexposure=2 --stockexposure=2 --basemax=0.01 --stockmax=1 --base=BTC --stock=ETH --numorders=10
```

The program will run as a Daemon.   You can kill any running bots with this:
```
sh killall.sh
```

**Parameters**

`./altilly_market_maker_js.sh` takes in 8 required arguments;
* `--apiKey=`: Your API Key
* `--apiSecret=`: Your API Secret
* `--spread=`: The spread percentage on the asset you would like to market make on
* `--baseexposure= or -be=`: The maximum percentage of your base account you want in the order book at any given time
* `--stockexposure= or -se=`: The maximum percentage of your stock ccount you want in the order book at any given time
* `--basemax=`: The maximum quantity of base asset can use to restrict max exposure
* `--stockmax=`: The maximum quantity of stock asset can use to restrict max exposure
* `--base= or -b=`: The base asset (e.g. in ETHBTC, BTC is the base asset)
* `--stock= or -s=`: The stock asset (e.g. in ETHBTC, ETH is the stock asset)
* `--numorders=`: How many orders do you want to place on each side. They will spread evenly according to your spread settings and quantity is exposure divided by numorders


### How it works

The bot will maintain a spread of a given percentage in the order book, based on the last price traded (or median price of best buy/sell if last price exceeds those boundaries).
If you sell, the bot will place a new buy order 5% below the sale price.
If you buy, the bot will place a new sell order 5% above the sale price.

The amount in each order is dependent on the `--baseexposure=` && `--stockexposure=` parameters. It will calculate the total {stock | base} balance * (stockexposure | baseexposure / 100).
For example;

```
Exposure percentage (be/se) = 1
Base asset balance (b) = 10
Stock asset balance (s) = 15

buy order amount = b(10) * (be(1) / 100)
sell order amount = s(15) * (se(1) / 100)  
```
