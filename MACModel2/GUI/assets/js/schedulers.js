// client library for Scheduler comparison application

const last_n = 50;

/* Get Scheduler Data from MACModel2 API  */
const RelayOut = async (scheduler) => {
  $('#thru_label').text(`${scheduler} Throughput: `);
  $('#apd_label').text(`${scheduler} Avg. Packet Delay: `);
  $('#asd_label').text(`${scheduler} Avg. Scheduler Delay: `);
  $('#plr_label').text(`${scheduler} Avg. Packet Loss Ratio: `);
  $('#thru_value').text(`computing...`);
  $('#apd_value').text(`computing...`);
  $('#asd_value').text(`computing...`);
  $('#plr_value').text(`computing...`);
  try {
    var resps = [];
    for (var i = 0; i < 5; i++) {
      resp = await axios.get(`https://sub-network-lte.herokuapp.com/SubNetworkLTE/Internal/Inspect/Transmission`).then(response => {
        return response
      }).catch(error => { })
      resp2 = await axios.get(`https://sub-network-lte.herokuapp.com/SubNetworkLTE/Internal/Inspect/Rejected`).then(response => {
        return response
      }).catch(error => { })
      resps.push([resp, resp2])
    }
    var highest = 0; var highest2 = 0; var response; var rejected;
    resps.forEach(resp => {
      if (resp[0].data.data[scheduler].size > highest && resp[1].data.data.length > highest2) {
        highest = resp[0].data.data[scheduler].size;
        highest2 = resp[1].data.data.length;
        [response, rejected] = resp;
      }
    })
    // perform needed transformations
    let raw = response.data.data[scheduler].data; // raw scheduler data
    let throughput = response.data.data[scheduler].size;
    let labels = raw.map(entry => { return entry.sessionId });
    let lost_packets = [];
    labels.forEach(sessionId => {
      lost = 0;
      rejected.data.data.forEach(lost_packet => {
        if (lost_packet === sessionId){
          lost++;
        }
      })
      lost_packets.push({
        lost : lost,
        sessionId : sessionId
      });
    })
    let QoS = raw.map(entry => { return entry.QoS });
    let avgPacketDelay = QoS.map(entry => { return entry.total_packet_delay / entry.packets_received });
    let avgSchedulerDelay = QoS.map(entry => { return entry.total_scheduler_delay / entry.packets_received });
    let avgRetransmissions = QoS.map(entry => { return entry.total_retransmissions / entry.packets_received });
    let packetLossRatio = lost_packets.map(entry => { return (entry.lost * 100) / (entry.lost + QoS[labels.indexOf(entry.sessionId)].packets_received) });
    if (packetLossRatio === 0){
      return await RelayOut(scheduler)
    } else {
      return [labels, raw.length, avgPacketDelay, avgSchedulerDelay, avgRetransmissions, packetLossRatio, throughput]
    }
  } catch(err){
    console.log(err)
    return await RelayOut(scheduler)
  }
}

const average = (arr) => {
  sum = 0
  arr.forEach(el => {
    sum += el;
  })
  try {
    return sum / arr.length
  } catch(err){
    return 0
  }
}

const resetNetwork = async () => {
  await axios.get(`https://sub-network-lte.herokuapp.com/SubNetworkLTE/Reset`).then(response => {
    console.log(response)
  }).catch(error => {
    console.log(error)
  })
}

/* asynchronous update */
const asyncUpdate = async (scheduler) => {
  // update chart
  [labels, packets, avgPacketDelay, avgSchedulerDelay, avgRetransmissions, packetLossRatio, throughput] = await RelayOut(scheduler);
  let myLabels = labels
  let APD = avgPacketDelay
  let ASD = avgSchedulerDelay
  let ART = avgRetransmissions
  let PLR = packetLossRatio
  $('#thru_value').text(`${packets.toLocaleString()} packets (${throughput.toLocaleString()} bits)`);
  $('#apd_value').text(`${average(APD).toLocaleString()}ms`);
  $('#asd_value').text(`${average(ASD).toLocaleString()}ms`);
  $('#plr_value').text(`${average(PLR).toLocaleString()}%`);
  new Chart(document.getElementById("line-chart"), {
    type: 'line',
    data: {
      labels: myLabels.slice(myLabels.length - last_n, ),
      datasets: [
        {
          data: APD.slice(APD.length - last_n, ),
          label: "Average Packet Delay (ms)",
          borderColor: "#3e95cd",
          fill: false
        }, {
          data: ASD.slice(ASD.length - last_n,),
          label: "Average Scheduler Delay (ms)",
          borderColor: "#8e5ea2",
          fill: false
        },
        {
          data: ART.slice(ART.length - last_n,),
          label: "Average Retransmissions",
          borderColor: "#cd3e6b",
          fill: false
        },
        {
          data: PLR.slice(PLR.length - last_n,),
          label: "Packet Loss Ratio (%)",
          borderColor: "#32a852",
          fill: false
        }
      ]
    },
    options: {
      title: {
        display: true,
        text: `${scheduler} Performance Indexes`
      }
    }
  });
}
