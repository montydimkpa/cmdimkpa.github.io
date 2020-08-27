// consume PrestoDBTest-Incoming requests

const axios = require('axios');

// settings

let interval = 1000;
var lastJob;

const fetchRequests = async () => {
    return await axios.post(`https://ods-gateway.herokuapp.com/ods/fetch_records`, {
        tablename: 'PrestoDBTest-Incoming',
        constraints : {
            __created_at__ : [Date.now() - 2*interval, Date.now()]
        }
    }).then(resp => {
        return resp.data.data
    }).catch(err => {
        return []
    })
}

const consume = async (job) => {
    axios.post(`http://localhost:2727/PrestoDBTest/api/v1/runJob?usePresto=${job.use_presto}`, {
        task : job.sql_query
    }).then(resp => {
        console.log(resp)
    }).catch(err => {
        console.log(err)
    })
}

const processRequests = async () => {
    let requests = await fetchRequests();
    if (requests.length > 0){
        for (var i=0;i<requests.length;i++){
            let request = requests[i];
            if (lastJob){
                if (request.__created_at__ > lastJob.__created_at__) {
                    await consume(request);
                }
            } else {
                await consume(request);
            }
        }
        lastJob = requests[requests.length - 1];
    } else {
        console.log('no requests to process')
    }
}


// run jobs

let consumer = setInterval(processRequests, interval);
