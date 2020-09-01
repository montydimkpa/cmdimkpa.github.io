/*
   client-library-pc-messaging.js
*/

// settings
const QueueType = "Incoming";
const throttlingFactor = 2;
const interval = 5000; // message pull interval
const throttle = throttlingFactor * interval;
const sessionTime = 3600000 // 1 hour session
const pageSize = 3;
var thisPage = 1;
var all_messages = [];
var lastMessage,
    moniker,
    avatar_b64;

var event_counter = 0;
var pwdFieldExposed = false;

const dbGateway = () => {
    // basic load balancer over multiple gateways
    event_counter++
    let gateways = [
        "https://ods-gateway2.herokuapp.com/ods",
        "https://ods-gateway3.herokuapp.com/ods",
        "https://ods-gateway4.herokuapp.com/ods"
    ];
    return gateways[event_counter % gateways.length];
}

const fetchMessages = async () => {
    var constraints;
    // retrieve messages added in the last throttle
    constraints = {
        __created_at__: [Date.now() - throttle, Date.now()],
        to : moniker
    }
    return await axios.post(`${dbGateway()}/fetch_records`,
        {
            tablename: `PCIncomingMessageQueue`,
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

let paginate = (array, pageSize, thisPage) => {
  if (pageSize && thisPage) {
    pageSize = parseInt(pageSize);
    thisPage = parseInt(thisPage);
    let pageStartIndex;
    if (thisPage.toString().includes("-")) {
      pageStartIndex = array.length - Math.abs(thisPage) * pageSize;
    } else {
      pageStartIndex = pageSize * (thisPage - 1);
    }
    return array.slice(pageStartIndex, pageStartIndex + pageSize);
  } else { return array }
}

const processMessages = async () => {
    let messages = await fetchMessages();
    let filtered = [];
    if (messages.length > 0) {
        for (var i = 0; i < messages.length; i++) {
            let message = messages[i];
            if (lastMessage) {
                if (message.__created_at__ > lastMessage.__created_at__) {
                    filtered.push(message);
                }
            } else {
                filtered.push(message);
            }
        }
        lastMessage = messages[messages.length - 1];
        if (filtered) {
            // UI code to handle messages
            all_messages = [...filtered.reverse(),...all_messages]
            UIMessageHandler(all_messages);
        }
    }
}

const UIMessageHandler = (messages) => {
    // handle new incoming messages
    console.log(messages)
}

const checkUserAuthenticated = async () => {
    var go;
    moniker = window.localStorage.getItem('moniker');
    let session_started = window.localStorage.getItem('session_started');
    if (moniker && session_started){
        let elapsed = Date.now() - session_started;
        if (elapsed < sessionTime){
            // Show message view
            go = true;
        }
    }
    return go;
}

const moniker_exists = async (try_moniker) => {
    let resp = await axios.post(`${dbGateway()}/fetch_records`,
        {
            tablename: `GetSocialUser`,
            constraints: { moniker : try_moniker },
            strict : true
        })
        .then(resp => { return resp.data.data })
        .catch(err => { return [] })
    return resp.length > 0
}

const registerUser = async (event) => {
    event.preventDefault()
    let try_moniker = document.getElementById("moniker").value;
    let password = document.getElementById("password").value;
    if (await moniker_exists(try_moniker)){
        // moniker exists
        $('#userError').text("This moniker already exists")
        $('.alert').show()
    } else {}
}

const toggleVisibility = (e) => {
    e.preventDefault()
    if (pwdFieldExposed){
        document.getElementById("password").type = "password";
        document.getElementById("toggle").value = "show";
    } else {
        document.getElementById("password").type = "text";
        document.getElementById("toggle").value = "hide";
    }
    pwdFieldExposed = !pwdFieldExposed;
}

const LoginRegisterForm = async () => {
    // waitscreen
    $('.alert').hide()
    $('#console').html(`<img src="https://cmdimkpa.github.io/GetSocial/client/waitscreen.gif" alt="alien-detected" class="center"><div class="center"><h6 style="text-align: center;">© Monty Dimkpa</h6></div>`)
    $('#attention').text(`Please login or register below`)
    $('#login_register_form').html(`<label for="moniker"><b>moniker  </b></label><input type="text" id="moniker" name="moniker" autofocus><br><br><label for="password"><b>password  </b></label><input type="password" id="password" name="password"><input id="toggle" type="submit" onclick="toggleVisibility(event)" value="show"><br><br><input type="submit" onclick="loginUser(event)" value="Login"> <input type="submit" onclick="registerUser(event)" value="Register">`)
}

const globalUpdate = async () => {
    checkUserAuthenticated()
      .then(go => {
          if (go){
              // load message view
              processMessages()
          } else {
              // user not authenticated
              LoginRegisterForm()
          }
      })
}
