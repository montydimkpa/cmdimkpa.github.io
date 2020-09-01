/*
   client-library-pc-messaging.js
*/

// settings
const QueueType = "Incoming";
const dbGateway = "https://ods-gateway.herokuapp.com/ods";
const throttlingFactor = 2;
const interval = 1000;
const expiryInterval = 3600000;
const throttle = throttlingFactor * interval;
var lastMessage,
    moniker,
    avatar_b64;

const fetchMessages = async (queue, user, expiredOnly = false) => {
    var constraints;
    if (expiredOnly) {
        // retrieve expired messages
        constraints = {
            __created_at__: [Date.now() - 2 * expiryInterval, Date.now() - expiryInterval]
        }
    } else {
        // retrieve messages added in the last throttle
        constraints = {
            __created_at__: [Date.now() - throttle, Date.now()]
        }
    }
    if (user) {
        // include only this user's messages in Incoming mode
        constraints["to"] = user;
    }
    return await axios.post(`${dbGateway}/fetch_records`,
        {
            tablename: `PC${queue}MessageQueue`,
            constraints: constraints
        }).then(resp => {
            // return message array   
            return resp.data.data
        })
        .catch(err => {
            // return empty array (no messages)
            return []
        })
}

const process_message = async (message) => {
    // this is a server function
 }

const processMessages = async () => {
    // handle messages contextually
    let user = QueueType === "Outgoing" ? null : moniker
    let messages = await fetchMessages(QueueType, user);
    if (!user) {
        if (messages.length > 0) {
            for (var i = 0; i < messages.length; i++) {
                let message = messages[i];
                if (lastMessage) {
                    if (message.__created_at__ > lastMessage.__created_at__) {
                        process_message(message);
                    }
                } else {
                    process_message(message);
                }
            }
            lastMessage = messages[messages.length - 1];
        } else {
            console.log('no messages to process')
        }
    } else {
        // UI code to handle messages
        UIMessageHandler(messages);
    }
}

const UIMessageHandler = (messages) => {
    // handle new incoming messages
    console.log("yeah")
}

const globalUpdate = async () => {
    processMessages()
}
