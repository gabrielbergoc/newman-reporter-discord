const prettyms = require('pretty-ms');
const axios = require('axios').default;
var jsonminify = require("jsonminify");

let messageSize;

// creates message for slack
function slackMessage(stats, timings, failures, executions, maxMessageSize, collection, environment, channel, reportingUrl, limitFailures) {
    messageSize = maxMessageSize;
    let parsedFailures = parseFailures(failures);
    let skipCount = getSkipCount(executions);
    let failureMessage = `
    [
        {
            "color": 16711680,
            "author": {
                "name": "Newman Tests"
            },
            "title": ":fire: Failures :fire:",
            "fields": [
                ${limitFailures > 0 ? failMessage(parsedFailures.splice(0, limitFailures)) : failMessage(parsedFailures)}
            ],
            "footer": {
                "text": "Newman",
                "icon_url": "https://platform.slack-edge.com/img/default_application_icon.png"
            }
        }
    ]`;
    let successMessage = `
    [
        {
            "color": 32768,
            "author": {
                "name": "Newman Tests"
            },
            "title": ":white_check_mark: All Passed :white_check_mark:",
            "footer": {
                "text": "Newman",
                "icon_url": "https://platform.slack-edge.com/img/default_application_icon.png"
            }
        }
    ]`;
    let mainContent =
        `# Test Results\\n` +
        `${collection ? `Collection:\\t${collection}\\n` : ""}` +
        `${environment ? `Environment:\\t${environment}\\n` : ""}` +
        `${reportingUrl ? `🔗 ${reportingUrl}\\n` : ""}` +
        `Total Tests:\\t${stats.requests.total}  \\n` +
        `Passed:\\t${stats.requests.total - parsedFailures.length - skipCount}  \\n` +
        `Failed:\\t${parsedFailures.length}  \\n` +
        `Skipped:\\t${skipCount}  \\n` +
        `Duration:\\t${prettyms(timings.completed - timings.started)}  \\n` +
        `Total Assertions:\\t${stats.assertions.total}\\n` +
        `Failed Assertions:\\t${stats.assertions.failed}`
    ;

    return jsonminify(`
    {
        "channel_id": "${channel}",
        "type": 0,
        "content": "${mainContent}",
        "embeds": ${failures.length > 0 ? failureMessage : successMessage}
    }`);
}

function getSkipCount(executions) {
    return executions.reduce((acc, execution) => {
        if (execution.assertions) {
            if (execution.assertions[0].skipped) {
                acc = acc + 1;
            }
        }
        return acc;
    }, 0);
}


// Takes fail report and parse it for further processing
function parseFailures(failures) {
    return failures.reduce((acc, failure, index) => {
        if (index === 0) {
            acc.push({
                name: failure.source.name || 'No Name',
                tests: [{
                    name: failure.error.name || 'No test name',
                    test: failure.error.test || 'connection error',
                    message: failure.error.message || 'No Error Message'
                }]
            });
        } else if (acc[acc.length - 1].name !== failure.source.name) {
            acc.push({
                name: failure.source.name || 'No Name',
                tests: [{
                    name: failure.error.name || 'No test name',
                    test: failure.error.test || 'connection error',
                    message: failure.error.message || 'No Error Message'
                }]
            });
        } else {
            acc[acc.length - 1].tests.push({
                name: failure.error.name || 'No test name',
                test: failure.error.test || 'connection error',
                message: failure.error.message || 'No Error Message'
            })
        }
        return acc;
    }, []);
}

// Takes parsedFailures and create failMessages
function failMessage(parsedFailures) {
    return parsedFailures.map((failure) => {
        return `
        {
            "name": "Test Name",
            "value": "${failure.name}",
            "inline": true
        },
        ${failErrors(failure.tests)}`;
    }).join();
}

// Takes failMessages and create Error messages for each failures
function failErrors(parsedErrors) {
    return parsedErrors.map((error, index) => {
        return `
        {
            "name": "${index + 1}. ${error.name} - ${error.test}",
            "value": "• ${cleanErrorMessage(error.message, messageSize)}"
        }`;
    }).join();
}

function cleanErrorMessage(message, maxMessageSize) {
    // replaces the quotes and double quotes in order for the message to be valid json format
    // as well as cutting messages to size 100 and truncating it with ...
    let filteredMessage = message.replace(/["']/g, "")
    filteredMessage = filteredMessage.replace('expected', 'Expected -')
    if (filteredMessage.length > maxMessageSize) {
        return `${filteredMessage.substring(0, maxMessageSize)}...`;
    }
    return filteredMessage;
}


// sends the message to slack via POST to webhook url
async function send(url, message, token) {
    const payload = {
        method: 'POST',
        url,
        headers: {
            'content-type': 'application/json',
            'Authorization': 'Bearer ' + token
        },
        data: message
    };

    let result;
    try {
        result = await axios(payload);
    } catch (e) {
        result = false;

        if (e.response) {
            console.error("Status:", e.response.status);
            console.error("Headers:", e.response.headers);
            console.error("Body:", JSON.stringify(e.response.data, null, 2));
        } else if (e.request) {
            console.error("No response received:", e.request);
        } else {
            console.error("Error setting up request:", e.message);
        }
    }
    return result;
}

exports.slackUtils = {
    send,
    slackMessage
};