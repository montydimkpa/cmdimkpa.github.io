/*
   client-library-pc-messaging.js
*/

// settings
const QueueType = "Incoming";
const throttlingFactor = 3;
const interval = 3000; // message pull interval
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
var formLoaded = false;
var currentPage = [];

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
        filtered = [...new Set(filtered)];
        if (filtered.length > 0) {
            // UI code to handle messages
            all_messages = [...filtered.reverse(),...all_messages]
            setCurrentPage(all_messages);
        }
    }
}

const setCurrentPage = async (messages) => {
    // set current page of message stream
    currentPage = paginate(messages, pageSize, thisPage);
}

const get_hash = (str) => {
    var hash = sha256.create();
    hash.update(str.toString());
    return hash.hex();
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

const user_exists = async (try_moniker, password_hash) => {
    let resp = await axios.post(`${dbGateway()}/fetch_records`,
        {
            tablename: `GetSocialUser`,
            constraints: { moniker: try_moniker, password_hash : password_hash },
            strict: true
        })
        .then(resp => { return resp.data.data })
        .catch(err => { return [] })
    return resp.length > 0
}

const createNewUserAccount = async (moniker, password_hash) => {
    await axios.post(`${dbGateway()}/new_record`,
        {
            tablename: `GetSocialUser`,
            data: { moniker : moniker, password_hash : password_hash }
        })
        .then(resp => {  })
        .catch(err => {  })
}

const registerUser = async (event) => {
    event.preventDefault()
    let try_moniker = document.getElementById("moniker").value;
    let password = document.getElementById("password").value;
    if (await moniker_exists(try_moniker)){
        // moniker exists
        $('#userError').text("This moniker already exists")
    } else {
        if (try_moniker.length > 3 && password.length > 3){
            // register new user
            let password_hash = get_hash(password);
            moniker = try_moniker;
            createNewUserAccount(moniker, password_hash)
            // store local creds
            window.localStorage.setItem("moniker", moniker);
            window.localStorage.setItem("session_started", Date.now());
            $('#userError').text("User registration successful")
            $('#notice').addClass("success")
        } else {
            $('#userError').text("Moniker and Password should both be greater than 3 characters")
        }
    }
    $('#notice').show()
    formLoaded = false;
}

const loginUser = async (event) => {
    event.preventDefault()
    let try_moniker = document.getElementById("moniker").value;
    let password = document.getElementById("password").value;
    if (await user_exists(try_moniker, get_hash(password))) {
        // user exists - update local creds
        moniker = try_moniker;
        window.localStorage.setItem("moniker", moniker);
        window.localStorage.setItem("session_started", Date.now());
        $('#userError').text("User login successful")
        $('#notice').addClass("success")
    } else {
        // no such user
        $('#userError').text("Could not authenticate")
    }
    $('#notice').show()
    formLoaded = false;
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
    if (!formLoaded){
        $('#notice').hide()
        $('#notice').removeClass("success")
        $('#attention').addClass("blink_me");
        $('#logout').hide()
        $('#console').html(`<img src="https://cmdimkpa.github.io/GetSocial/client/waitscreen.gif" alt="alien-detected" class="center"><div class="center"><h6 style="text-align: center;">© Monty Dimkpa</h6></div>`)
        $('#attention').text(`Please login or register below`)
        $('#login_register_form').html(`<label for="moniker"><b>moniker  </b></label><input type="text" id="moniker" name="moniker" autofocus><br><br><label for="password"><b>password  </b></label><input type="password" id="password" name="password"><input id="toggle" type="submit" onclick="toggleVisibility(event)" value="show"><br><br><input type="submit" onclick="loginUser(event)" value="Login"> <input type="submit" onclick="registerUser(event)" value="Register">`)
        formLoaded = true;
    }
}

const logout = async (event) => {
    event.preventDefault()
    window.localStorage.setItem("moniker", undefined);
    window.localStorage.setItem("session_started", undefined);
    window.location.reload()
}

const messageBox = (message) => {
    return `<div class="container darker"><p><b>${message.from}: </b>${message.text}</p><span class="time-left">${message.timestamp}<span><img src="https://cmdimkpa.github.io/GetSocial/client/reply.gif" alt="reply" width="100%"></span></span></div>`
}

const LoadMessageView = async () => {
    // prepare view and load messages
    processMessages().then(
        () => {
            $('#notice').hide();
            $('#attention').removeClass("blink_me");
            $('#attention').html(`welcome, <b>@${moniker}</b>!`);
            $('#logout').show();
            $('#login_register_form').html(``);
            currentPage.length > 0 ? $('#console').html(currentPage.map(message => messageBox(message)).join("")) : $('#console').html(`<img src="https://cmdimkpa.github.io/GetSocial/client/nomail.jpg" alt="alien-detected" class="center"><div class="center"><h6 style="text-align: center;">© Monty Dimkpa</h6></div>`)
        }
    )
}

const globalUpdate = async () => {
    checkUserAuthenticated()
      .then(go => {
          if (go){
              // load message view
              LoadMessageView()
          } else {
              // user not authenticated
              LoginRegisterForm()
          }
      })
}
