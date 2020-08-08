// client library for Scheduler comparison application

/* Get Scheduler Data from MACModel2 API  */
const RelayOut = async (scheduler) => {
  try {
    var resps = [];
    for (var i = 0; i < 5; i++) {
      resp = await axios.get(`https://sub-network-lte.herokuapp.com/SubNetworkLTE/Internal/Inspect/Transmission`).then(response => {
        return response
      }).catch(error => { })
      resps.push(resp)
    }
    var highest = 0; var response;
    resps.forEach(resp => {
      if (resp.data.data[scheduler].size > highest) {
        highest = resp.data.data[scheduler].size;
        response = resp;
      }
    })
    let raw = response.data.data[scheduler].data; // raw scheduler data
    let throughput = response.data.data[scheduler].size;
    // perform needed transformations
    let labels = raw.map(entry => { return entry.sessionId });
    let QoS = raw.map(entry => { return entry.QoS });
    let avgPacketDelay = QoS.map(entry => { return entry.total_packet_delay / entry.packets_received });
    let avgSchedulerDelay = QoS.map(entry => { return entry.total_scheduler_delay / entry.packets_received });
    let avgRetransmissions = QoS.map(entry => { return entry.total_retransmissions / entry.packets_received });
    let packetLossRatio = QoS.map(entry => { return (entry.lost_packets * 100) / (entry.lost_packets + entry.packets_received) });
    return [labels, raw.length, avgPacketDelay, avgSchedulerDelay, avgRetransmissions, packetLossRatio, throughput]
  } catch(err){
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
  $('#thru_label').text(`${scheduler} Throughput: `);
  $('#apd_label').text(`${scheduler} Avg. Packet Delay: `);
  $('#asd_label').text(`${scheduler} Avg. Scheduler Delay: `);
  $('#plr_label').text(`${scheduler} Avg. Packet Loss Ratio: `);
  $('#thru_value').text(`${packets} packets (${throughput.toLocaleString()} bits)`);
  $('#apd_value').text(`${average(APD).toLocaleString()}ms`);
  $('#asd_value').text(`${average(ASD).toLocaleString()}ms`);
  $('#plr_value').text(`${average(PLR).toLocaleString()}%`);
  new Chart(document.getElementById("line-chart"), {
    type: 'line',
    data: {
      labels: myLabels,
      datasets: [
        {
          data: APD,
          label: "Average Packet Delay (ms)",
          borderColor: "#3e95cd",
          fill: false
        }, {
          data: ASD,
          label: "Average Scheduler Delay (ms)",
          borderColor: "#8e5ea2",
          fill: false
        },
        {
          data: ART,
          label: "Average Retransmissions",
          borderColor: "#cd3e6b",
          fill: false
        },
        {
          data: PLR,
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
