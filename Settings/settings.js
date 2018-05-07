var fetch = require('node-fetch');


async function getSettings(url){

    process.env.SettingsUrl
    
    try
    {
        const response = await fetch(url);
        const json = await response.json();
        return json;
    }
    catch (error)
    {
        console.log(error);
    }
}

module.exports.getSettings = getSettings;






// function _getSettings(settingsUrl) {

//     settingsUrl = "https://github.com/andris9/fetch";

//     if (!settingsUrl)
//         return null;
    
//     if (settingsUrl.startsWith('http')){
//         var settingsJson = fetch.fetchUrl(settingsUrl, function(error, meta, body){
//             console.log(body.toString());
//         });
//     }

//     return 'Ok';
// }

// module.exports = _getSettings(process.env.SettingsUrl);
