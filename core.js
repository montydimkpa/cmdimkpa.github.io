/*
    core.js - Citizen Reporter Application
*/

// Imports
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const compression = require('compression');
const md5 = require('md5');
const shajs = require('sha.js');
const axios = require('axios')
const AWS = require('aws-sdk');
const fileUpload = require('express-fileupload');
const { accessKeyId, secretAccessKey, region } = require('./s3config.json')
const sleep = require('util').promisify(setTimeout);
const fs = require('fs')
const { env, flags } = require('tdmf')
env.options.debug = false

// App Settings
const app = express();
app.options('*', cors())
const PORT = process.env.PORT || 3700;

// S3 service
const s3 = new AWS.S3({
  accessKeyId : accessKeyId,
  secretAccessKey : secretAccessKey,
  region : region
});

// Middleware

// bodyParser
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// file upload
app.use(fileUpload());

//CORS
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
});

// compression
app.use(compression())

// catch general errors
app.use((error, req, res, next) => {
    if (error instanceof SyntaxError) {
        // Syntax Error
        res.status(400);
        res.json({ code: 400, message: "Malformed request. Check and try again." });
    } else {
        // Other error
        res.status(400);
        res.json({ code: 400, message: "There was a problem with your request." });
        next();
    }
});

// functions

var user_tokens = {}

let event_counter = 0

let now = () => {
    return Date();
}

const handleError = async (cb, errorCode, optional_msg = null, optional_info = {}) => {
  var errorPayload;
  switch (errorCode){
    case 401:
    errorPayload = {
      code : 401,
      message : optional_msg ? optional_msg : "Error: Unauthorized Access",
      data : optional_info
    };
    break;
    default:
  }
  cb.status(errorCode)
  cb.json(errorPayload)
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

let new_id = () => {
    return md5(now() + Math.random().toString());
}

const hash = (x) => {
    return shajs('sha256').update(x).digest('hex')
}

const is_good_password = (password) => {
    let strongRegex = new RegExp("^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#\$%\^&\*])(?=.{8,})")
    return strongRegex.test(password)
}

const datatype = (x) => {
    var type;
    // float test
    try {
        if (!parseFloat(x)) { type = 0 } else { type = 1 }
    } catch (err) { }
    // JSON test
    try {
        if (typeof JSON.parse(x) === 'object') { type = 2 }
    } catch (err) {
        if (typeof x === 'object') { type = 2 }
    }
    return type
}

const local_search = (results, property, value) => {
    let found = []
    try {
        for (let i = 0; i < results.length; i++) {
            let result = results[i]
            if (result[property] === value) { found.push(result) }
        }
    } catch (err) { }
    return found
}

const local_update = (result, update) => {
    let props = Object.keys(update)
    props.forEach(prop => {
        try {
            result[prop] = update[prop]
        } catch (err) { }
    })
    return result
}

const local_multi_search = (results, constraints) => {
    let matches = results
    properties = Object.keys(constraints)
    properties.forEach(property => {
        matches = local_search(matches, property, constraints[property])
    })
    return matches
}

const local_restrict = (result, features) => {
    let restricted = {}
    features.forEach(feature => {
        try {
            restricted[feature] = result[feature]
        } catch (err) { }
    })
    return JSON.stringify(restricted) !== '{}' ? restricted : result
}

const local_multi_restrict = (results, features) => {
    return results.map(result => { return local_restrict(result, features) })
}

const local_delete_match = (results, constraints) => {
    let matches = local_multi_search(results, constraints)
    let indexes = matches.map(x => { return results.indexOf(x) })
    let use = []
    for (let i = 0; i < results.length; i++) {
        if (indexes.indexOf(i) === -1) { use.push(results[i]) }
    }
    return use
}

const local_multi_update = (results, constraints, update) => {
    let matches = local_multi_search(results, constraints)
    let indexes = matches.map(x => { return results.indexOf(x) })
    let updated = matches.map(match => { return local_update(match, update) })
    let count = -1
    indexes.forEach(index => {
        count++
        results[index] = updated[count]
    })
    return results
}

const fformat = (x, asText=false, dp=4) => {
  let base = parseFloat(parseFloat(x).toFixed(dp));
  if (asText){
    return base.toLocaleString('en-US', {minimumFractionDigits: dp})
  } else {
    return base
  }
}

const dbGateway = () => {
    event_counter++
    if (event_counter > 100000){ event_counter = 0 }
    gateways = [
        "http://167.71.99.31:3099"
    ]
    return gateways[event_counter % gateways.length]
}

const s3upload = async (context, username, filesObject, allowed_types, file_size_limit) => {
  // upload files to the CDN
  allowed_types = allowed_types.map(type => { return type.toLowerCase() })
  let filenames = Object.keys(filesObject);
  let urls = [];
  let failed = [];
  for (var file_index=0;file_index<filenames.length;file_index++){
    let filename = filenames[file_index];
    let parts = filename.split(".");
    var typeError;
    var sizeError;
    if (allowed_types.indexOf(parts[1].toLowerCase()) === -1) { typeError = true; failed.push(`${filename} : type '${parts[1].toUpperCase()}' not allowed`)}
    if (filesObject[filename].size > file_size_limit) { sizeError = true; failed.push(`${filename} : size ${filesObject[filename].size} over limit (${file_size_limit})`)}
    if (!typeError && !sizeError){
      let fileContent  = Buffer.from(filesObject[filename].data, 'binary');
      let file_key = `${context}/${username}/${parts[0]+OTP(2)+"."+parts[1]}`;
      let params = {
        Key: file_key,
        Body: fileContent,
        Bucket: "citizen-reporter-video-upload",
        ContentType: filesObject[filename].mimetype
      }
      let response = await s3.upload(params, function(err, data) {});
      if (!response.failed){ urls.push(`https://citizen-reporter-video-upload.s3.amazonaws.com/${file_key}`); } else { failed.push(`${filename} : upload error`); }
    }
  }
  return [urls, failed];
}

const userInfo = async (constraints, field=null) => {
  // get a user's information
  if (Object.keys(constraints).indexOf("user_id") !== -1){
    if (!constraints.user_id){
      return null
    }
  }
  try {
      return await axios.post(`${dbGateway()}/ods/fetch_records`, {
        tablename : "user",
        "constraints": constraints,
        strict : true
      }).then(resp=>{
        return field ? resp.data.data[0][field] : resp.data.data[0];
      }).catch(err=>{})
  } catch(err) {
      return null
  }
}

const updateUserdata = async (user_id, userdata) => {
  // update a user's information
  try {
      return await axios.post(`${dbGateway()}/ods/update_records`, {
        tablename : "user",
        "constraints" : { "user_id" : user_id },
        data : { "userdata" : userdata }
      }).then(resp=>{
        return resp.data;
      }).catch(err=>{
        return err.response;
      })
  } catch(err) {
      return null
  }
}

const updateUserInfo = async (user_id, info) => {
  // update a user's information
  try {
      return await axios.post(`${dbGateway()}/ods/update_records`, {
        tablename : "user",
        "constraints" : { "user_id" : user_id },
        data : {
          username : info.username,
          password : info.password,
          userdata : info.userdata
        }
      }).then(resp=>{
        return resp.data;
      }).catch(err=>{
        return err.response;
      })
  } catch(err) {
      return null
  }
}

const postSessionInfo = async (sessionInfo) => {
  // post new sessionInfo object
  try {
      return await axios.post(`${dbGateway()}/ods/new_record`, {
        tablename : "uploadSession",
        data : sessionInfo
      }).then(resp=>{
        return resp.data;
      }).catch(err=>{
        return err.response;
      })
  } catch(err) {
      return null
  }
}

const metadataService = async (sessionReference) => {
  // send upload session to Metadata service
  return {
    code : 503,
    message : 'Service Temporarily Unavailable',
    data : {  }
  }
}

const OTP = (otp_length) => {
  let otp_str = ""
  let allowed = [1,2,3,4,5,6,7,8,9];
  while (otp_str.length < otp_length){
    otp_str+=`${allowed[Math.floor(Math.random()*allowed.length)]}`
  }
  return parseInt(otp_str);
}


/*Signup and Login*/

app.post('/login/user', cors(),  async (req, res) => {
  let username = req.body.username;
  let password = req.body.password;
  if (username && password){
    let info = await userInfo({ username : username });
    if (info && info.password === hash(password)){
      let new_user_id = new_id();
      // store old and new tokens in memory
      user_tokens[info.username] = [info.user_id, new_user_id];
      await axios.post(`${dbGateway()}/ods/update_records`, {
        tablename : "user",
        constraints : { username : username },
        data : {
          loggedIn : true,
          user_id : new_user_id
        }
      }).then(resp => {}).catch(err => {})
      // redirect to profile
      res.redirect(`/profile/fetch/${username}/${new_user_id}`)
    } else {
      // Invalid data
      res.status(400)
      res.json({
        code : 400,
        message : "Error: wrong username/password combination",
        data : {}
      })
    }
  } else {
    res.status(400)
    res.json({
      code : 400,
      message : "Error: check that <username> and <password> are provided",
      data : {}
    })
  }
})

app.put('/logout/:username/:user_id', cors(),  async (req, res) => {
  let user_id = req.params.user_id;
  let username = req.params.username;
  if (user_id){
    let info = await userInfo({ user_id : user_id }) || await token_patch(username, user_id, true)
    if (info){
      await axios.post(`${dbGateway()}/ods/update_records`, {
        tablename : "user",
        constraints : { user_id : info.user_id },
        data : {
          loggedIn : false
        }
      }).then(resp => {}).catch(err => {})
      res.status(200)
      res.json({
        code : 200,
        message : "User logged out",
        data : {
          loggedIn : false
        }
      })
  } else {
    res.status(400)
    res.json({
        code : 400,
        message : "Error: check that <user_id> and <username> params are provided",
        data : {}
      })
    }
  }
})

app.put('/profile/changePassword/:username', cors(),  async (req, res) => {
  // change password
  let password = req.body.password;
  let new_password = req.body.new_password;
  let user_id = req.headers.authorization;
  let username = req.params.username;
  if (password && new_password && user_id && username){
    let info = await userInfo({ user_id : user_id }) || await token_patch(username, user_id, true)
    if (info.password === req.body.old_password_hashed ? password : hash(password)){
      if (is_good_password(new_password)){
        // check old password
        if (info.userdata.forgotPassword){
          if (info.userdata.forgotPassword.old_passwords.indexOf(hash(new_password)) !== -1
           || info.userdata.forgotPassword.old_passwords.indexOf(new_password) !== -1){
            // handle can't use old password
            res.status(400)
            res.json({
              code : 400,
              message: `Error: you can't change to an old password`,
              data : {}
            })
          }
        }
        // change password
        let response = await axios.post(`${dbGateway()}/ods/update_records`, {
          tablename : "user",
          constraints : { user_id : info.user_id },
          data : { password : hash(new_password) }
        })
        .then(resp => {
          return resp.data;
        })
        .catch(err => {
          return err.response;
        })
        //
        res.status(200)
        res.json({
          code : 200,
          message : "Password changed successfully",
          data : {}
        })
      } else {
        // handle weak password
        res.status(400)
        res.json({
          code : 400,
          message : "Password should be at least 8 chars and include numerals and special chars",
          data : {}
        })
      }
    } else {
      // handle bad password
      res.status(400)
      res.json({
        code : 400,
        message : "Passwords do not match",
        data : { "password_sent" : password }
      })
    }
  } else {
    // handle missing data
    res.status(400)
    res.json({
      code : 400,
      message : "Error: please provide <password>, <new_password>, <username> and <header: authorization>",
      data : {}
    })
  }
})

app.delete('/profile/delete/:user_id', cors(),  async (req, res) => {
  // delete profile
  let user_id = req.params.user_id;
  if (await userInfo({ "user_id" : user_id })){
    let response = await axios.post(`${dbGateway()}/ods/update_records`, {
      tablename : "user",
      constraints : { "user_id" : user_id },
      data : { __private__ : 1 }
    }).then(response => {
      return response
    }).catch(error => {
      return error.response
    })
    res.status(response.data.code)
    res.json(response.data)
  } else {
    // handle missing data
    res.status(403)
    res.json({
      code : 403,
      message : "Error: please provide a valid <user_id>",
      data : {}
    })
  }
})

app.post('/signup/form', cors(),  async (req, res) => {
  // signup Citizen Reporter user
  let username = req.body.username;
  let role = req.body.role || "user"
  let password = req.body.password;
  let first_name = req.body.first_name;
  let last_name = req.body.last_name;
  let source = req.body.source || "N/A"
  let email = req.body.email || "N/A"
  let country = req.body.country;
  if (username && role && password && first_name && last_name && source){
    let users = await axios.post(`${dbGateway()}/ods/fetch_records`, {
      tablename : "user",
      constraints : {},
      strict : true
    }).then(resp => {
      return resp.data.data
    }).catch(err => {})
    let matching_username = local_search(users, "username", username);
    let matching_password = local_search(users, "password", hash(password));
    if (matching_username.length > 0){
      // handle username exists
      res.status(400)
      res.json({
        code : 400,
        message : "Error: username exists",
        data : { you_sent : username }
      })
    }
    // create user account
    let info = {
      username : username,
      role : role,
      loggedIn : false,
      userdata : {
        profile_image : null,
        email : email,
        first_name : first_name,
        last_name : last_name,
        profile_name : `${first_name} ${last_name}`,
        demo : {
          demo_account_id : `Demo-${OTP(8)}`,
          messages : [],
          notifications : []
        },
        live : {
          live_account_id : `Live-${OTP(8)}`,
          messages : [],
          notifications : []
        },
        username : username,
        country : country,
        source : source,
        uploads_videos : []
      }
    }
    if (is_good_password(password)){
      info["password"] = hash(password)
      let response = await axios.post(`${dbGateway()}/ods/new_record`, {
          tablename : "user",
          data : info
      }).then(resp => {
        return resp.data;
      }).catch(err => {
        return err.response;
      })
      res.status(response.code)
      res.json(response.data)
    } else {
      // handle weak password
      res.status(400)
      res.json({
        code : 400,
        message : "Password should be at least 8 chars and include numerals and special chars",
        data : {}
      })
    }
  } else {
    // handle missing data
    res.status(400)
    res.json({
      code : 400,
      message : "Error: some required data is missing, check form",
      data : {}
    })
  }
})

/* utils */

app.get('/utils/inspect/:nonce/:username/:property', cors(),  async (req, res) => {
  let username = req.params.username;
  let property = req.params.property;
  var nonce;
  try {
    nonce = parseInt(req.params.nonce);
  } catch(err){}
  if (username && property && nonce){
    if (nonce % 47 === 0) {
      let parts = property.split('.')
      var boundary = await userInfo({ "username" : username }, parts[0]);
      if (boundary){
        var response = {};
        if (parts.length > 1){
          for (var k=1;k < parts.length;k++){
            boundary = boundary[parts[k]];
          }
        }
        response[property] = boundary;
        res.status(200)
        res.json({
          code : 200,
          message: `${property} attached`,
          data: response
        })
      } else {
        // handle username does not exist
        res.status(404)
        res.json({
          code : 404,
          message: `Error: user [${username}] does not exist.`,
          data : {}
        })
      }
    } else {
      res.status(403)
      res.json({
        code : 403,
        message : "Access Forbidden",
        data : {}
      })
    }
  } else {
    res.status(403)
    res.json({
      code : 403,
      message : "Access Forbidden",
      data : {}
    })
  }
})

app.post('/utils/messages/thread/:type/new', cors(),  async (req, res) => {
  const auth = req.headers.authorization;
  if (await userInfo({ user_id : auth })){
    let type = req.params.type;
    let user_constraint = { username : req.query.username };
    let admin_constraint = { username : "parallelscore" };
    let account = req.query.account;
    let subject = req.body.subject;
    let message = req.body.message;
    if (user_constraint.username && account && subject && message){
      let thread_id = OTP(6);
      let sender_thread = {
        "thread_id" : thread_id,
        "subject" : subject,
        recipient : type === 'admin' ? user_constraint.username : "parallelscore",
        sender : type === 'admin' ? "parallelscore" : user_constraint.username,
        posts : [{
          id : OTP(6),
          time_label : Date(),
          timestamp : Date.now(),
          "message" : message,
          read : false,
          deleted : false,
          isSender : true
        }],
        deleted : false
      };
      let recipient_thread = {
        "thread_id" : thread_id,
        "subject" : subject,
        recipient : type === 'admin' ? user_constraint.username : "parallelscore",
        sender : type === 'admin' ? "parallelscore" : user_constraint.username,
        posts : [{
          id : OTP(6),
          time_label : Date(),
          timestamp : Date.now(),
          "message" : message,
          read : false,
          deleted : false,
          isSender : false
        }],
        deleted : false
      };
      // update admin messages
      let info = await userInfo(admin_constraint);
      let admindata = info.userdata;
      let admin_id = info.user_id;
      admindata[account].messages.unshift(type === 'admin' ? sender_thread : recipient_thread);
      await updateUserdata(admin_id, admindata);
      // update user messages
      info = await userInfo(user_constraint);
      let userdata = info.userdata;
      let user_id = info.user_id;
      userdata[account].messages.unshift(type === 'admin' ? recipient_thread : sender_thread);
      await updateUserdata(user_id, userdata);
      //
      res.status(201)
      res.json({
        code : 201,
        message : "Message thread created successfully",
        data : {
          "thread_id" : thread_id
        }
      })
    } else {
      // handle missing data
      res.status(400)
      res.json({
        code : 400,
        message: `Error: please provide <username>, <account>, <subject> and <message>`,
        data : {}
      })
    }
  } else {
    // unauthorized
    await handleError(res, 401, null, { you_sent_auth : auth })
  }
})


app.post('/utils/messages/thread/:type/reply', cors(),  async (req, res) => {
  const auth = req.headers.authorization;
  if (await userInfo({ user_id : auth })){
    let type = req.params.type;
    let user_constraint = { username : req.query.username };
    let admin_constraint = { username : "parallelscore" };
    let account = req.query.account;
    let thread_id = req.query.thread_id;
    let message = req.body.message;
    if (user_constraint.username && account && thread_id && message){
      let sender_msg = {
        id : OTP(6),
        time_label : Date(),
        timestamp : Date.now(),
        "message" : message,
        read : false,
        deleted : false,
        isSender : true
      };
      let recipient_msg = {
        id : OTP(6),
        time_label : Date(),
        timestamp : Date.now(),
        "message" : message,
        read : false,
        deleted : false,
        isSender : false
      };
      try {
        // update admin messages
        userInfo(admin_constraint).then(info => {
          let admindata = info.userdata;
          let admin_id = info.user_id;
          let thread = local_search(admindata[account].messages, "thread_id", parseInt(thread_id))[0];
          let index = admindata[account].messages.indexOf(thread);
          thread.posts.push(type === 'admin' ? sender_msg : recipient_msg);
          admindata[account].messages[index] = thread;
          updateUserdata(admin_id, admindata).then(resp => {
            // update user messages
            userInfo(user_constraint).then(info => {
              let userdata = info.userdata;
              let user_id = info.user_id;
              let thread = local_search(userdata[account].messages, "thread_id", parseInt(thread_id))[0];
              let index = userdata[account].messages.indexOf(thread);
              thread.posts.push(type === 'admin' ? recipient_msg : sender_msg);
              userdata[account].messages[index] = thread;
              updateUserdata(user_id, userdata).then(resp => {
                // handle response
                res.status(200)
                res.json({
                  code : 200,
                  message : "Message thread updated successfully",
                  data : {}
                });
              });
            });
          });
        });
      } catch(err){
        // handle thread does not exist
        res.status(404)
        res.json({
          code : 404,
          message: `Error: thread ${thread_id} was not found`,
          data : {}
        })
      }
    } else {
      // handle missing data
      res.status(400)
      res.json({
        code : 400,
        message: `Error: please provide <username>, <account>, <thread_id> and <message>`,
        data : {}
      })
    }
  } else {
    // unauthorized
    await handleError(res, 401, null, { you_sent_auth : auth })
  }
})

app.delete('/utils/messages/delete/:username/:account/:thread_id', cors(),  async (req, res) => {
  const auth = req.headers.authorization;
  if (await userInfo({ user_id : auth })){
    let user_constraint = { username : req.params.username };
    let account = req.params.account;
    let thread_id = req.params.thread_id;
    if (user_constraint.username && account && thread_id){
      try {
        // update user messages
        userInfo(user_constraint).then(info => {
          let userdata = info.userdata;
          let user_id = info.user_id;
          let thread = local_search(userdata[account].messages, "thread_id", parseInt(thread_id))[0];
          let index = userdata[account].messages.indexOf(thread);
          if (index !== -1){
            thread.deleted = true;
            userdata[account].messages[index] = thread;
            updateUserdata(user_id, userdata).then(resp => {
              // handle response
              res.status(200)
              res.json({
                code : 200,
                message : "Message thread deleted successfully",
                data : {}
              });
            });
          } else {
            // handle no such thread
            res.status(404)
            res.json({
              code : 404,
              message: `Error: the thread ${thread_id} was not found`,
              data : {}
            })
          }
        });
      } catch(err){
        // handle thread does not exist
        res.status(404)
        res.json({
          code : 404,
          message: `Error: thread ${thread_id} was not found`,
          data : {}
        })
      }
    } else {
      // handle missing data
      res.status(400)
      res.json({
        code : 400,
        message: `Error: please provide <username>, <account> and <thread_id>`,
        data : {}
      })
    }
  } else {
    // unauthorized
    await handleError(res, 401, null, { you_sent_auth : auth })
  }
})

const nonce = () => {
  let digits = [2,3,4,5,6,7,8,9];
  let rdigit = () => {
    return digits[Math.floor(Math.random()*digits.length)]
  }
  return rdigit()*Math.pow(47,rdigit())
}

app.get('/utils/messages/:username/:account/pull', cors(),  async (req, res) => {
  const auth = req.headers.authorization;
  if (await userInfo({ user_id : auth })){
    let username = req.params.username;
    let account = req.params.account;
    let response = await axios.get(`${dbGateway()}/utils/inspect/${nonce()}/${username}/userdata.${account}.messages`)
      .then(resp => {
        return resp.data;
      })
      .catch(err => {
        return err.response;
      })
    if (response.code === 200){
      let messages = local_search(response.data[`userdata.${account}.messages`], "deleted", false);
      res.status(200);
      res.json({
        code : 200,
        message : `${messages.length} messages in ${account.toUpperCase()} mail`,
        data : { messages : messages }
      });
    } else {
      // handle error
      res.status(response.code);
      res.json(response);
    }
  } else {
    // unauthorized
    await handleError(res, 401, null, { you_sent_auth : auth })
  }
})

app.post('/utils/notifications/push', cors(),  async (req, res) => {
  let user_id = req.query.user_id;
  let account = req.query.account;
  let subject = req.body.subject;
  let message = req.body.message;
  if (user_id && account && subject && message){
    let notification = {
      "id" : OTP(6),
      "subject" : subject,
      "time_label" : Date(),
      "timestamp" : Date.now(),
      "message" : message,
      "read" : false,
      "deleted" : false
    };
    let userdata = await userInfo({ "user_id" : user_id }, "userdata");
    if (userdata){
      // update and notify
      userdata[account].notifications.unshift(notification);
      let response = await updateUserdata(user_id, userdata);
      res.status(response.code)
      res.json(response)
    } else {
      // handle invalid user
      res.status(403)
      res.json({
        code : 403,
        message : "Invalid User",
        data : {}
      })
    }
  } else {
    // handle missing data
    res.status(400)
    res.json({
      code : 400,
      message: "Error: please provide <user_id>, <account>, <subject> and <message>",
      data : {}
    })
  }
})

app.put('/utils/notifications/read', cors(),  async (req, res) => {
  let user_id = req.query.user_id;
  let account = req.query.account;
  let notification_id = req.query.notification_id;
  if (user_id && account && notification_id){
    let userdata = await userInfo({ "user_id" : user_id }, "userdata");
    if (userdata){
      //
      try {
        let notification = local_search(userdata[account].notifications, "id", parseInt(notification_id))[0];
        let index = userdata[account].notifications.indexOf(notification);
        notification.read = true;
        userdata[account].notifications[index] = notification;
        let response = await updateUserdata(user_id, userdata);
        res.status(response.code)
        res.json(response)
      } catch(err) {
        // handle notification not found
        res.status(404)
        res.json({
          code : 404,
          message : `Error: notification with id ${notification_id} was not found`,
          data : {}
        })
      }
    } else {
      // handle invalid user
      res.status(403)
      res.json({
        code : 403,
        message : "Invalid User",
        data : {}
      })
    }
  } else {
    // handle missing data
    res.status(400)
    res.json({
      code : 400,
      message: "Error: please provide <user_id>, <account>, and <notification_id>",
      data : {}
    })
  }
})

app.post('/public/gallery', cors(),  async (req, res) => {
  let constraints = req.body.constraints || {  }
  let strict_search = req.body.strict_search || false
  let track = req.body.track
  let pageSize = req.query.pageSize
  let thisPage = req.query.thisPage
  let gallery = await axios.post(`${dbGateway()}/ods/fetch_records`, {
    tablename : "uploadSession",
    constraints : constraints,
    strict : strict_search
  }).then(resp => { return resp.data.data }).catch(err=>{})
  // publish public videos
  public = []
  gallery.forEach((folder) => {
    folder.videos = local_search(folder.videos, "is_public", true)
    folder.videos.forEach((video) => {
      public.unshift(video)
    })
  })
  // sort videos by popularity
  if (track === 'popular'){
    public = public.sort(function(a,b){ return b.video_info.views - a.video_info.views })
  }
  res.status(200)
  res.json({
    code : 200,
    message: 'Matching Gallery items attached',
    data : paginate(public, pageSize, thisPage)
  })
})

app.post('/profile/update/:user_id', cors(),  async (req, res) => {
  let user_id = req.params.user_id
  let update = req.body.update || { }
  let info = await userInfo({ user_id : user_id });
  if (info){
    if (update.username && update.password){
      info.username = update.username
      info.password = hash(update.password)
    }
    Object.keys(info.userdata).forEach((field) => {
      if (Object.keys(update).indexOf(field) !== -1){
        info.userdata[field] = update[field]
      }
    })
    await updateUserInfo(user_id, info);
    res.status(200)
    res.json({
      code : 200,
      message: 'User data updated successfully',
      data : info
    })
  } else {
    res.status(401)
    res.json({
      code : 401,
      message: 'Unauthorized Access: Invalid User',
      data : { you_sent : { user_id : user_id } }
    })
  }
})

app.post('/metadataService/hook', cors(),  async (req, res) => {
  // write logic for Webhook here
  res.status(200)
  res.json({
    code : 200,
    message: 'Thanks for your update',
    data : { }
  })
})

app.delete('/utils/notifications/delete', cors(),  async (req, res) => {
  let user_id = req.query.user_id;
  let account = req.query.account;
  let notification_id = req.query.notification_id;
  if (user_id && account && notification_id){
    let userdata = await userInfo({ "user_id" : user_id }, "userdata");
    if (userdata){
      //
      try {
        let notification = local_search(userdata[account].notifications, "id", parseInt(notification_id))[0];
        let index = userdata[account].notifications.indexOf(notification);
        notification.deleted = true;
        userdata[account].notifications[index] = notification;
        let response = await updateUserdata(user_id, userdata);
        res.status(response.code)
        res.json(response)
      } catch(err) {
        // handle notification not found
        res.status(404)
        res.json({
          code : 404,
          message : `Error: notification with id ${notification_id} was not found`,
          data : {}
        })
      }
    } else {
      // handle invalid user
      res.status(403)
      res.json({
        code : 403,
        message : "Invalid User",
        data : {}
      })
    }
  } else {
    // handle missing data
    res.status(400)
    res.json({
      code : 400,
      message: "Error: please provide <user_id>, <account>, and <notification_id>",
      data : {}
    })
  }
})

app.get('/utils/notifications/pull', cors(),  async (req, res) => {
  let user_id = req.query.user_id;
  let account = req.query.account;
  if (user_id && account){
    let userdata = await userInfo({ "user_id" : user_id }, "userdata");
    if (userdata){
      //
      let notifications = local_search(userdata[account].notifications, "deleted", false);
      res.status(200)
      res.json({
        code : 200,
        message : "Notifications attached",
        data : notifications
      })
    } else {
      // handle invalid user
      res.status(403)
      res.json({
        code : 403,
        message : "Invalid User",
        data : {}
      })
    }
  } else {
    // handle missing data
    res.status(400)
    res.json({
      code : 400,
      message: "Error: please provide <user_id> and <account>",
      data : {}
    })
  }
})

const token_patch = async ( username, possible_last_token, info_requested = false ) => {
  // the token patch aims to prevent login errors by recognizing immediate last token
  try {
    // condition for this patch is that token supplied must be the immediate last token
    if (possible_last_token === user_tokens[username][0]){
      // return true or fetch user info as required
      if (info_requested){
        // constrain userInfo on current user_id, return null on error
        return await userInfo({ user_id : user_tokens[username][1] });
      } else {
        return true;
      }
    }
  }catch(err){
    return info_requested ? null : false;
  }
}

const fetch_user_gallery = async (username) => {
  return await axios.post(`${dbGateway()}/ods/fetch_records`, {
    tablename : "uploadSession",
    "constraints": { username : username },
    strict : true
  }).then(resp=>{
    return resp.data.data
  }).catch(err=>{
    return [ ]
  })
}

const updateUploadSession = async (uploadSession_id, uploadSession) => {
  await axios.post(`${dbGateway()}/ods/update_records`, {
    tablename : "uploadSession",
    constraints : { uploadSession_id : uploadSession_id },
    strict : true,
    data : uploadSession
  }).then(resp=>{}).catch(err=>{})
  return null
}

const update_user_gallery = async (username, gallery) => {
  for (var i=0; i<gallery.length; i++){
    let uploadSession = gallery[i];
    await updateUploadSession(uploadSession.uploadSession_id, uploadSession);
  }
  return null
}

const safely_evaluate = (prop) => {
  if (prop === undefined){
    return 'undefined'
  } else {
    return prop
  }
}

app.put('/utils/videos/change-scope/:username/:user_id', cors(),  async (req, res) => {
  let username = req.params.username;
  let user_id = req.params.user_id;
  let links = req.body.links;
  let upvotes = req.body.upvotes || 0;
  let downvotes = req.body.downvotes || 0;
  let views = req.body.views || 0;
  let is_public = safely_evaluate(req.body.is_public);
  let reason = req.body.reason || 'untitled';
  if (user_id && username){
    // fetch userdata
    let info = await userInfo({ "user_id" : user_id }) || await token_patch(username, user_id, true)
    if (info){
      // fetch user gallery
      gallery = await fetch_user_gallery(info.username)
      // change video settings in profile and on the gallery
      for (var i=0; i<links.length; i++){
        let link = links[i];
        // extract video object; update change scope reason and metrics
        let [ video ] = local_search(info.userdata.uploads_videos, "link", link);
        video.video_info.change_scope_history.unshift({ reason : reason, timestamp : Date(), utc : Date.now() })
        video.video_info.views += parseInt(views)
        video.video_info.upvotes += parseInt(upvotes)
        video.video_info.downvotes += parseInt(downvotes)
        let rubric = { video_info : video.video_info }
        if (is_public !== 'undefined'){
          rubric['is_public'] = is_public
        }
        /*
          business logic for making video private based on downvotes:
             there should be at least 100 views of the video and downvotes should be at least 20% more than upvotes
             e.g. 100 views - 60 downvotes, 40 upvotes
        */
        if (video.video_info.views > 100 && (video.video_info.downvotes / video.video_info.upvotes - 1) > 0.2){
          rubric["is_public"] = false
        }
        // update video register
        info.userdata.uploads_videos = local_multi_update(info.userdata.uploads_videos, { link : link }, rubric)
        // search user's gallery videos to make updates
        for (var j=0; j<gallery.length; j++){
          // update video register (gallery)
          gallery[j].videos = local_multi_update(gallery[j].videos, { link : link }, rubric)
        }
      }
      await update_user_gallery(info.username, gallery) // update public gallery
      result = await updateUserdata(user_id, info.userdata)
      res.status(200)
      res.json({
        code : 200,
        message: "video settings updated",
        data : result
      })
    } else {
      // no such profile
      res.status(404)
      res.json({
        code : 404,
        message: `profile: ${user_id} was not found`,
        data : {}
      })
    }
  } else {
    // handle missing data
    res.status(400)
    res.json({
      code : 400,
      message : "Error: please provide <user_id> and <username>",
      data : {}
    })
  }
})

app.get('/profile/fetch/:username/:user_id', cors(),  async (req, res) => {
  let username = req.params.username;
  let user_id = req.params.user_id;
  if (user_id && username){
    // fetch userdata
    let info = await userInfo({ "user_id" : user_id }) || await token_patch(username, user_id, true)
    if (info){
      let profile = info.userdata;
      profile["user_id"] = info.user_id;
      profile["loggedIn"] = true;
      res.status(200)
      res.json({
        code : 200,
        message: "profile attached",
        data : { "profile" : profile }
      })
    } else {
      // no such profile
      res.status(404)
      res.json({
        code : 404,
        message: `profile: ${user_id} was not found`,
        data : {}
      })
    }
  } else {
    // handle missing data
    res.status(400)
    res.json({
      code : 400,
      message : "Error: please provide <user_id> and <username>",
      data : {}
    })
  }
})

app.post('/utils/upload/profile_image/:user_id', cors(),  async (req, res) => {
  let user_id = req.params.user_id;
  let allowed_types = ["jpg", "png", "svg"];
  let file_size_limit = 3000000;
  let info = await userInfo({ "user_id" : user_id });
  if (req.files && info){
    let [urls, failed] = await s3upload("profile_images", info.username, req.files, allowed_types, file_size_limit);
    // update userdata
    var dbResponse;
    if (urls.length > 0){
      userdata = info.userdata
      userdata.profile_image = urls[0];
      dbResponse = await updateUserdata(user_id, userdata)
    }
    res.status(200)
    res.json({
      code : 200,
      message: `succeeded : ${urls.length}, failed : ${failed.length}`,
      data: { succeeded : urls, errors : failed, "dbResponse" : dbResponse }
    })
  } else {
    // handle no file selected or unauthorized
    res.status(400),
    res.json({
      code : 400,
      message: 'Error: Unauthorized: No file(s) selected',
      data : {}
    })
  }
})

const getSessionInfo = async (ip) => {
  let data = await axios.get(`https://ipinfo.io/${ip}`).then((resp) => { return resp.data}).catch((err) => { return null })
  if (data){
    return data
  } else {
    await sleep(1000) // retry after 1 second
    return await getSessionInfo(ip)
  }
}

const uploadActions = async (sessionInfo, user_id, userdata) => {
  // post video session
  postSessionInfo(sessionInfo).then((sessionReference) => {
    env.update('sessionReference', sessionReference)
    // synchronize profile
    updateUserdata(user_id, userdata).then((dbResponse) => {
      dbResponse['session'] = env.fetch('sessionReference')
      // send to metadata service
      metadataService(env.fetch('sessionReference')).then((metadataServiceResponse) => {
        dbResponse['meta'] = metadataServiceResponse
        env.update('dbResponse', dbResponse)
      })
    })
  })
}

app.post('/utils/upload/profile_objects/:context/:user_id', cors(),  async (req, res) => {
  let user_id = req.params.user_id;
  let context = req.params.context;
  var is_public;
  let video_info = {};
  is_public = req.body.is_public || false;
  video_info['title'] = req.body.title || req.query.title || 'untitled';
  video_info['about'] = req.body.about || req.query.about || 'untitled';
  video_info['location'] = req.body.location || req.query.location || 'untitled';
  let allowed_types = ["mp4", "mov", "wmv", "flv", "avi", "avchd", "webm", "mkv"];
  let file_size_limit = 100000000;
  let info = await userInfo({ "user_id" : user_id });
  if (req.files && info){
    let [urls, failed] = await s3upload(context, info.username, req.files, allowed_types, file_size_limit);
    // update userdata
    var dbResponse;
    if (urls.length > 0){
      // create and post upload session
      let ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
      let sessionInfo = await getSessionInfo(ip);
      // initialize video metrics
      video_info['change_scope_history'] = []
      video_info['upvotes'] = 0
      video_info['downvotes'] = 0
      video_info['views'] = 0
      sessionInfo['title'] = video_info.title;
      sessionInfo['about'] = video_info.about;
      sessionInfo['location'] = video_info.location;
      sessionInfo['device'] = req.header('User-Agent')
      sessionInfo['username'] = info.username
      sessionInfo['videos'] = []
      let userdata = info.userdata;
      urls.forEach((url) => {
        videodata = { link: url, video_info: video_info, is_public : is_public }
        userdata[`uploads_${context}`].unshift(videodata)
        sessionInfo['videos'].unshift(videodata)
      })
      await uploadActions(sessionInfo, user_id, userdata)
      dbResponse = env.fetch('dbResponse')
      env.deleteAll()
    }
    res.status(200)
    res.json({
      code : 200,
      message: `succeeded : ${urls.length}, failed : ${failed.length}`,
      data: { succeeded : urls, errors : failed, "dbResponse" : dbResponse }
    })
  } else {
    // handle unauthorized or no file selected
    res.status(400),
    res.json({
      code : 400,
      message: 'Error: Unauthorized : No file(s) selected',
      data : {}
    })
  }
})

// launch server
app.listen(PORT, () => {
    console.log(`citizen-reporter-core-api: now running on port ${PORT}`);
});
