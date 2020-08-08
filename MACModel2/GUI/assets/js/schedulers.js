// client library for Scheduler comparison application

/* Get Scheduler Data from MACModel2 API  */
const RelayOut = async (scheduler) => {
  return await axios.get(`https://sub-network-lte.herokuapp.com/SubNetworkLTE/Internal/Inspect/Transmission`).then(response => {
    let raw = response.data.data[scheduler].data; // raw scheduler data
    // perform needed transformations
    let labels = raw.map(entry => { return entry.sessionId });
    let QoS = raw.map(entry => { return entry.QoS });
    let avgPacketDelay = QoS.map(entry => { return entry.total_packet_delay / entry.packets_received });
    let avgSchedulerDelay = QoS.map(entry => { return entry.total_scheduler_delay / entry.packets_received });
    let avgRetransmissions = QoS.map(entry => { return entry.total_retransmissions / entry.packets_received });
    return [labels, QoS, avgPacketDelay, avgSchedulerDelay, avgRetransmissions]
  }).catch(error => {
    console.log(error)
  })
}

/* asynchronous update */
const asyncUpdate = async (scheduler) => {
  // update chart
  [labels, QoS, avgPacketDelay, avgSchedulerDelay, avgRetransmissions] = await RelayOut(scheduler);
  let myLabels = labels
  let APD = avgPacketDelay
  let ASD = avgSchedulerDelay
  let ART = avgRetransmissions
  new Chart(document.getElementById("line-chart"), {
    type: 'line',
    data: {
      labels: myLabels,
      datasets: [{
          data: APD,
          label: "Average Packet Delay",
          borderColor: "#3e95cd",
          fill: false
        }, {
          data: ASD,
          label: "Average Scheduler Delay",
          borderColor: "#8e5ea2",
          fill: false
        },
        {
          data: ART,
          label: "Average Retransmissions",
          borderColor: "#cd3e6b",
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
