const getSettings = require('../Settings/settings')

var settings

(async function init() {
    settings = await getSettings()
})();

function MapAssetForward(symbol){
    var result = symbol

    var base = symbol.split("/")[0]
    var quote = symbol.split("/")[1]

    var assetsMapping = settings.EccxtExchangeConnector.Main.AssetsMapping
    for (const element of assetsMapping) {
        if (base == element.value){
            result = element.key + "/" + quote
            break
        }
        if (quote == element.value){
            result = base + "/" + element.key
            break
        }
    }

    return result
}

function MapAssetBackward(symbol){
    var result = symbol

    var base = symbol.split("/")[0]
    var quote = symbol.split("/")[1]

    var assetsMapping = settings.EccxtExchangeConnector.Main.AssetsMapping
    for (const element of assetsMapping) {
        if (base == element.key){
            result = element.value + "/" + quote
            break
        }
        if (quote == element.key){
            result = base + "/" + element.value
            break
        }
    }

    return result
}

function TryToMapSymbolForward(symbol, exchange) {
    var result = symbol

    var base = symbol.split("/")[0]
    var quote = symbol.split("/")[1]

    var assetsMapping = settings.EccxtExchangeConnector.Main.AssetsMapping
    for (const element of assetsMapping) {
        var exchangeHasntSymbol = typeof exchange.findMarket(symbol) !== "object";
        var mappedSymbol = MapAssetForward(symbol)
        var exchangeHasMapped = typeof exchange.findMarket(mappedSymbol) === "object"
        if (exchangeHasntSymbol && exchangeHasMapped){
            result = mappedSymbol
            break
        }
    }

    return result
}

function TryToMapSymbolBackward(symbol, exchange) {
    var result = symbol

    var base = symbol.split("/")[0]
    var quote = symbol.split("/")[1]

    var assetsMapping = settings.EccxtExchangeConnector.Main.AssetsMapping
    for (const element of assetsMapping) {
        var exchangeHasSymbol = typeof exchange.findMarket(symbol) === "object"
        var mappedSymbol = MapAssetBackward(symbol)
        var exchangeHasntMapped = typeof exchange.findMarket(mappedSymbol) !== "object"
        if (exchangeHasSymbol && exchangeHasntMapped){
            result = mappedSymbol
            break
        }
    }

    return result
}

module.exports.MapAssetForward = MapAssetForward
module.exports.MapAssetBackward = MapAssetBackward
module.exports.TryToMapSymbolForward = TryToMapSymbolForward
module.exports.TryToMapSymbolBackward = TryToMapSymbolBackward
