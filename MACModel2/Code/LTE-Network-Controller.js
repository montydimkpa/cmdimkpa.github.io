// MACMODEL 2 - Network Services   Controller

const axios = require('axios');

// Network service settings

let burstSize = 10;
let burstInterval = 1000;
let modulationInterval = 1;
let profilerInterval = 1;
let sorterInterval = 1;
let schedulerInterval = 1;
let resetInterval = 43200000;

// event counters

let send_events = 0;
let mod_events = 0;
let prof_events = 0;
let srt_events = 0;
let sch_events = 0;

const sendPackets = async () => {
    send_events++;
    await axios.get(`https://sub-network-lte.herokuapp.com/SubNetworkLTE/AirInterface/UERegistration/${burstSize}`).then(response => {
        console.log(`SEND_PACKETS: ${response.data} (${send_events})`)
    }).catch(err => {
        console.log(err)
    })
}

const modulatePackets = async () => {
    mod_events++;
    await axios.get(`https://sub-network-lte.herokuapp.com/SubNetworkLTE/PhysicalUplinkControlChannel/Modulation`).then(response => {
        console.log(`MODULATE_PACKETS: ${response.data} (${mod_events})`)
    }).catch(err => {
        console.log(err)
    })
}

const profilePackets = async () => {
    prof_events++;
    await axios.get(`https://sub-network-lte.herokuapp.com/SubNetworkLTE/MAC/Profiler`).then(response => {
        console.log(`PROFILE_PACKETS: ${response.data} (${prof_events})`)
    }).catch(err => {
        console.log(err)
    })
}

const sortPackets = async () => {
    srt_events++;
    await axios.get(`https://sub-network-lte.herokuapp.com/SubNetworkLTE/Scheduler/Sorter`).then(response => {
        console.log(`SORT_PACKETS: ${response.data} (${srt_events})`)
    }).catch(err => {
        console.log(err)
    })
}

const schedulePackets = async () => {
    sch_events++;
    await axios.get(`https://sub-network-lte.herokuapp.com/SubNetworkLTE/Scheduler/Schedule`).then(response => {
        console.log(`SCHEDULE_PACKETS: ${response.data} (${sch_events})`)
    }).catch(err => {
        console.log(err)
    })
}

const reset = async () => {
    await axios.get(`https://sub-network-lte.herokuapp.com/SubNetworkLTE/Reset`).then(response => {
        console.log(`RESET: ${response.data}`)
    }).catch(err => {
        console.log(err)
    })
}


// run all network services

let emitter = setInterval(sendPackets, burstInterval);
let modulator = setInterval(modulatePackets, modulationInterval);
let profiler = setInterval(profilePackets, profilerInterval);
let sorter = setInterval(sortPackets, sorterInterval);
let scheduler = setInterval(schedulePackets, schedulerInterval);
let resetter = setInterval(reset, resetInterval);
