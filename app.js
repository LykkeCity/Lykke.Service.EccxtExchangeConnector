"use strict";

const ccxt = require ('ccxt')
const amqp = require('amqplib/callback_api')
//const settings = require('./Settings/settings');
const moment = require('moment');



// (async () => {
//     var config = await settings.getSettings();

//     var temp2 = 10;
// })();






var rabbitMqConnectionString = 'amqp://lykke.history:lykke.history@rabbit-me.lykke-me.svc.cluster.local:5672';
var exchangeOrderBooksName = 'lykke.EccxtExchangeConnector.orderBooks';
var exchangeTickPricesName = 'lykke.EccxtExchangeConnector.tickPrices';

;(async () => {

    var channel = null;

    amqp.connect(rabbitMqConnectionString, function(err, conn) {
      conn.createChannel(function(err, ch) {
        
        ch.assertExchange(exchangeOrderBooksName);
        //ch.assertExchange(exchangeTickPricesName);

        channel = ch;

      });
    });



    // const exchanges = [ /*"bitfinex",*/ "bitstamp", "bitmex", "cex", /*"exmo",*/ "gdax", "gemini", "kraken", /*"lykke",*/ /*"quoinex",*/ /*"coinfloor",*/
    // "dsx", /*"hitbtc2",*/ "livecoin", "mixcoins", /*"tidex",*/ "itbit" ]

    const exchanges = [ "bitmex" ]
    const symbols = [ 'BTC/USD', 'ETH/USD'/*, 'BTC/EUR', 'BTC/GBP', 'ETH/EUR', 'ETH/GBP'*/ ]

    await Promise.all (exchanges.map (exchangeId =>

        new Promise (async (resolve, reject) => {

            const exchange = new ccxt[exchangeId] ({ enableRateLimit: true })

            while (true) {

                for (const symbol of symbols){

                    await exchange.loadMarkets ()

                    if (exchange.symbols.includes(symbol)){
                        
                        const orderBook = await exchange.fetchL2OrderBook (symbol)

                        var timestamp = moment.utc().toISOString()
                        timestamp = timestamp.substring(0, timestamp.indexOf('.'))
                        var base = symbol.substring(0, symbol.indexOf('/'))
                        var quote = symbol.substring(symbol.indexOf("/") + 1);
                        let bestBid = orderBook.bids.length ? orderBook.bids[0] : undefined
                        let bestAsk = orderBook.asks.length ? orderBook.asks[0] : undefined
                        var orderBookObj = {
                            'source': exchangeId,
                            'asset': symbol.replace("/", ""),
                            'AssetPair': { 'base': base, 'quote': quote },
                            'timestamp': timestamp
                        }

                        if (bestBid){
                            orderBookObj.bids = [ { 'price': bestBid[0], 'volume': bestBid[1] } ]
                        }
                        if (bestAsk){
                            orderBookObj.asks = [ { 'price': bestAsk[0], 'volume': bestAsk[1] } ]
                        }
                        var orderBookJson = JSON.stringify(orderBookObj);
                        console.log (orderBookJson)

                        if (channel)
                            channel.publish(exchangeOrderBooksName, '', new Buffer(orderBookJson));
                    }                    

                }

            }

        })

    ))

}) ()