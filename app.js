"use strict";

const express = require('express')
const ccxt = require('ccxt')
const getRabbitMqChannel = require('./RabbitMq/rabbitMq')
const getSettings = require('./Settings/settings')
const mapping = require('./Utils/symbolMapping')
const moment = require('moment')
const packageJson = require('./package.json')

process.on('uncaughtException',  e => { console.log(e); /*process.exit(1)*/ })
process.on('unhandledRejection', e => { console.log(e); /*process.exit(1)*/ })

var settings
var channel

(async function main() {
    console.log("Started, settingsUrl: " + process.env.SettingsUrl)

    settings = await getSettings()
    channel = await getRabbitMqChannel(settings)

    produceExchangesData()

    startWebServer()
})();


function startWebServer(){
    const response = {
        "Name": "Lykke.Service.EccxtExchangeConnector",
        "Version": packageJson.version,
        "Env": null,
        "IsDebug": false,
        "IssueIndicators": []
      }
    const responseJson = JSON.stringify(response)

    var app = express();

    app.get('/api/IsAlive', function (req, res) {
       res.send(responseJson);
    })
    
    var server = app.listen(5000, function () {
       var host = server.address().address
       var port = server.address().port

       if (host === "::") { 
           host = "localhost" }
       console.log("Listening at http://%s:%s", host, port)
    })
}

async function produceExchangesData() {
    const exchanges = settings.EccxtExchangeConnector.Main.Exchanges
    const symbols = settings.EccxtExchangeConnector.Main.Symbols

    await Promise.all(exchanges.map (exchangeName =>
        produceExchangeData(exchangeName, symbols)
    ))
}

function getAvailableSymbolsForExchange(exchange, symbols){
    var result = []
    
    var assetsMapping = settings.EccxtExchangeConnector.Main.AssetsMapping
    symbols.forEach(symbol => {
        var exchangeHas = typeof exchange.findMarket(symbol) === "object"
        if (exchangeHas){
            result.push(symbol)
        } else {
            var exchangeHasMapped = typeof exchange.findMarket(mapping.MapAssetForward(symbol)) === "object" 
            if (exchangeHasMapped){
                result.push(symbol)
            }
        }
    })

    return result
}

async function produceExchangeData(exchangeName, symbols) {

    return new Promise(async (resolve, reject) => {

        const rateLimit = settings.EccxtExchangeConnector.Main.RateLimitInMilliseconds
        var exchange = new ccxt[exchangeName]({ rateLimit: rateLimit, enableRateLimit: true })

        var availableSymbols = []
        try{
            await exchange.loadMarkets()

            availableSymbols = getAvailableSymbolsForExchange(exchange, symbols)
            if (availableSymbols.length === 0)
                return reject(exchange.id + " doesn't have any symbols from config")
        } catch (e){
            return reject(exchange.id + " can't load markets")
        }

        let currentProxy = 0
        var proxies = settings.EccxtExchangeConnector.Main.Proxies
        while (true) {
            for (var symbol of availableSymbols){
                try {
                    symbol = mapping.TryToMapSymbolForward(symbol, exchange);
                    var orderBook = await produceOrderBook(exchange, symbol);
                    await produceTickPrice(orderBook);
                    //TODO: Change proxy if request took twice (extract this const to config) as much time as in the config
                }
                catch (e) {
                    if (e instanceof ccxt.DDoSProtection
                        || e instanceof ccxt.ExchangeNotAvailable
                        || (e.message && (e.message.includes('ECONNRESET') || e.message.includes("limit exceeded")))
                        || (e.error && e.error === 1015)
                        || e instanceof ccxt.RequestTimeout
                        || (e.message && e.message.includes('timed out')))
                    {
                        // change proxy in round robin style
                        currentProxy = ++currentProxy % proxies.length
                        exchange.proxy = proxies[currentProxy]
                    }
                    else {
                        console.log("%s, %s, proxy: %s", e, exchange.id, exchange.proxy)
                        //throw e;
                    }
                }
            }
        }

    });

}

// TODO: next methods must be refactored
async function produceOrderBook(exchange, symbol){
    const orderBook = await exchange.fetchL2OrderBook(symbol)

    symbol = mapping.TryToMapSymbolBackward(symbol, exchange)

    var timestamp = moment.utc().toISOString()
    timestamp = timestamp.substring(0, timestamp.indexOf('.')) // cut off fractions of seconds
    var base = symbol.substring(0, symbol.indexOf('/'))
    var quote = symbol.substring(symbol.indexOf("/") + 1)
    var suffixConfig = settings.EccxtExchangeConnector.Main.ExchangesNamesSuffix
    var suffix = suffixConfig ? suffixConfig : "(e)"
    var source = exchange.name.replace(exchange.version, "").trim()
    var orderBookObj = {
        'source': source + suffix,
        'asset': symbol.replace("/", ""),
        'AssetPair': { 'base': base, 'quote': quote },
        'timestamp': timestamp
    }

    var bids = []
    for(const bid of orderBook.bids){
        bids.push({ 'price': bid[0], 'volume': bid[1] })
    }
    orderBookObj.bids = bids

    var asks = []
    for(const ask of orderBook.asks){
        asks.push({ 'price': ask[0], 'volume': ask[1] })
    }
    orderBookObj.asks = asks

    if (orderBookObj.bids.length === 0 && orderBookObj.asks.length === 0){
        throw new ccxt.DDoSProtection()
    }

    sendToRabitMQ(settings.EccxtExchangeConnector.RabbitMq.OrderBooks, orderBookObj)
    
    if (settings.EccxtExchangeConnector.Main.Verbose){
        console.log("OB: %s %s %s, bids[0]: %s, asks[0]: %s, proxy: %s", moment().format("DD.MM.YYYY hh:mm:ss"), exchange.id, orderBookObj.asset, orderBookObj.bids[0].price, orderBookObj.asks[0].price, exchange.proxy)
    }

    return orderBookObj;
}

async function sendToRabitMQ(rabbitExchange, object){
    //TODO: check if it is changed, if not - don't publish (settings in config)

    var objectJson = JSON.stringify(object)

    channel.publish(rabbitExchange, '', new Buffer(objectJson))
}

async function produceTickPrice(orderBook){
    //const tickPrice = await exchange.fetchTicker(symbol)
    const tickPrice = tickPriceFromOrderBook(orderBook)
    if (!tickPrice){
        return
    }

    sendToRabitMQ(settings.EccxtExchangeConnector.RabbitMq.TickPrices, tickPrice)

    if (settings.EccxtExchangeConnector.Main.Verbose){
        console.log("TP: %s %s %s, bid[0]: %s, ask[0]: %s", moment().format("DD.MM.YYYY hh:mm:ss"), tickPrice.source, tickPrice.asset, tickPrice.bid, tickPrice.ask)
    }
}

function tickPriceFromOrderBook(orderBook){
    var tickPrice = {}
    tickPrice.source = orderBook.source
    tickPrice.asset = orderBook.asset
    tickPrice.timestamp = orderBook.timestamp
    let bestBid = orderBook.bids.length ? orderBook.bids[0] : undefined
    let bestAsk = orderBook.asks.length ? orderBook.asks[0] : undefined
    if (!bestBid || !bestAsk){
        return null
    }
    if (bestBid && bestBid.price) {
        tickPrice.bid = bestBid.price
    }
    else {
        tickPrice.bid = null
    }
    if (bestAsk && bestAsk.price) {
        tickPrice.ask = bestAsk.price
    }
    else {
        tickPrice.ask = null
    }

    return tickPrice
}