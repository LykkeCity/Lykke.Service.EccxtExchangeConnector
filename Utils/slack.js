const request = require('request');

async function sendToSlack(lines, settings) {

    slackChatUrl = settings.EccxtExchangeConnector.Main.StaleDataMonitoring.SlackChatUrl

    if (!slackChatUrl)
        throw "'SlackChatUrl' is not set in settings"

    try
    {
        var options = {
          uri: slackChatUrl,
          form: '{"text": "' + lines.join("\r\n")  + '", "mrkdown": True }'
        };
        request.post(options, function(error, response, body){
          if (error || response.statusCode != 200) {
            console.log('error: '+ response.statusCode + body);
          }
        });
    }
    catch (error)
    {
        console.log(error)
    }
}

module.exports = sendToSlack