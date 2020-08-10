#============== Python3 Flask Model of LTE Sub Network ==============

#   Version: 1.00
#   Author: Monty Dimkpa

#====================================================================


#-------------- Importing required Python libraries --------------

from flask import Flask, request, render_template, Response
from flask_cors import CORS
import sys
import os
import json
from random import random
import datetime
from hashlib import md5
from math import log10

app = Flask(__name__)
cors = CORS(app, resources={r"/*": {"origins": "*"}})

global server_host, server_port, scheduler_events, empty_retry_limit, MAC_packet_size, transmission_bit_limit_per_tti,\
       BER_baseline, retransmission_limit, packet_duplication, effective_delay_budget, min_IP_packet_size, max_IP_packet_size,\
       Transmission, NETWORK_DATA

#-------------- Network Initialization Parameters --------------

server_host = "localhost"
server_port = 5000
scheduler_events = 0
NETWORK_DATA = {}

#-------------- LTE Network Constants ------

# Transmission Bandwidth = 20MHz
# Number of RBs = 100 blocks
# RB Frequency = 180KHz
# 180 bits per block each TTI (1ms) x 100 blocks = 18000 bits per TTI (1ms)
# Number of sub-carriers = 12
MAC_packet_size = int(18000/12) # max bits per TTI divided by number of sub-carriers
transmission_bit_limit_per_tti = 18000
BER_baseline = 0.2 # Network Bit Error Rate baseline
retransmission_limit = 4 # Network packet retransmission limit
packet_duplication = 1 # Network packet duplication
effective_delay_budget = 300 # effective packet delay budget of 300ms for LTE
min_IP_packet_size = 3000
max_IP_packet_size = 5000

#-------------- Base Classes --------------

def responsify(status,message,data={}):
    code = int(status)
    a_dict = {"data":data,"message":message,"code":code}
    try:
        return Response(json.dumps(a_dict), status=code, mimetype='application/json')
    except:
        return Response(str(a_dict), status=code, mimetype='application/json')

def now(): return datetime.datetime.today()

def ms_elapsed(t): return int(1000*(now() - t).total_seconds())

def Id():
    hasher = md5(); hasher.update(str(now()).encode('utf-8'))
    return hasher.hexdigest()

def is_transcoding_error(noise_level):
    # generate transcoding error
    return noise_level > BER_baseline

def IP_Packet(sessionId, size, source, time):
    # This function returns an IP Packet
    return {
        "sessionId" : sessionId,
        "header" : [size, source, time, 0, 0],
        "payload_bits" : "".join([str(int(random()*2)) for i in range(size)])
    }

def MAC2IPSession(MAC_packet):
    # this function converts a MAC packet back to an IP session for retransmission
    session_time = now()
    IP_packet = IP_Packet(MAC_packet["sessionId"], MAC_packet["header"][8], MAC_packet["header"][1], session_time)
    IP_packet["header"][3] += MAC_packet["header"][0]  # add retransmission delay
    IP_packet["header"][4] = MAC_packet["header"][4]  # update retransmissions
    IP_packet["payload_bits"] = MAC_packet["header"][3]
    return [MAC_packet["header"][1], session_time, IP_packet["sessionId"], 1, duplicate([IP_packet], packet_duplication)]

def MAC_Packet(sessionId, trans_bits, source, delay, source_bits, retransmissions, packetId, packet_index, n_mac_packets, size):
    # this function returns a MAC packet
    return {
        "sessionId" : sessionId,
        "header" : [delay, source, now(), source_bits, retransmissions, packetId, packet_index, n_mac_packets, size],
        "payload_bits" : trans_bits
    }

def transcode_bits(bits, plan):
    # this is the bit transcoding function that copies bits from an IP packet stream into a new MAC packet
    noise_level = random()*random()  # random MAC noise level during transcoding
    field = [x for x in bits]
    bands = []
    for size in plan:
        source = []; trans = []
        for i in range(size):
            bit = field.pop(0) # preserve bit order
            source.append(bit)
            # bit error will occur if cell load increases baseline BER above current noise level
            if is_transcoding_error(noise_level):
                trans.append(str(abs(int(float(bit)-1))))
            else:
                trans.append(bit)
        bands.append(["".join(source), "".join(trans)])
    return bands

def transcoding_plan(x, b):
    # function for creating a plan to split a bit stream into smaller streams that are not greater than the MAC packet size
    divs = x // b
    rem = x % b
    if divs:
        if rem:
            return [b for i in range(divs)]+[rem]
        else:
            return [b for i in range(divs)]
    else:
        return [x]

def packet_size():
    # returns an initial random size for an IP packet
    return int(min_IP_packet_size + random()*(max_IP_packet_size - min_IP_packet_size))

def duplicate(array, n):
    # function to duplicate the IP packets n times given the original array
    container = []
    for obj in array:
        for i in range(n):
            container.append(obj)
    return container

def UESession(ip_address, n_packets):
    # authenticates a UE and creates a session to handle the IP packet uplink
    sessionId = Id()
    session_time = now()
    return [ip_address, session_time, sessionId, n_packets, duplicate([IP_Packet(sessionId, packet_size(), ip_address, session_time) for i in range(n_packets)], packet_duplication)]

def NetworkDataManager(netbuffer_host_dir):
    global NETWORK_DATA
    NETWORK_DATA[netbuffer_host_dir] = {}
    return NETWORK_DATA[netbuffer_host_dir]

def register_new_netbuffer(netbuffer_host_dir, netbuffer_type, container):
    global NETWORK_DATA
    NETWORK_DATA[netbuffer_host_dir][netbuffer_type] = container;

def write_netbuffer(netbuffer_host_dir, netbuffer_type, data):
    global NETWORK_DATA
    if netbuffer_type not in NETWORK_DATA[netbuffer_host_dir]:
        register_new_netbuffer(netbuffer_host_dir, netbuffer_type, None)
    NETWORK_DATA[netbuffer_host_dir][netbuffer_type] = data;
    return data

def read_netbuffer(netbuffer_host_dir, netbuffer_type):
    try:
        if netbuffer_type in NETWORK_DATA[netbuffer_host_dir]:
            return NETWORK_DATA[netbuffer_host_dir][netbuffer_type]
        else:
            return None
    except:
        return None

def reset_network():
    global NETWORK_DATA, Transmission
    Transmission = {
        "RR" : { "locked" : None, "packets" : [], "data" : [], "size" : 0 },
        "PF" : { "locked" : None, "packets" : [], "data" : [], "size" : 0 },
        "NV" : { "locked" : None, "packets" : [], "data" : [], "size" : 0 }
    }
    write_netbuffer("AirInterface", "UERegister", [])
    write_netbuffer("PhysicalUplinkControlChannel", "QueuedMACPackets", [])
    write_netbuffer("MAC", "TransmissionQueue", [])
    write_netbuffer("MAC", "RejectedPackets", [])
    write_netbuffer("Scheduler", "SortedPackets", {})
    return 200

def safely_divide(a, b):
    try:
        return a/b
    except:
        return 1

def limit_of_zero(x, override=False):
    if x == 0:
        if not override:
            return 1
        else:
            return -1
    else:
        return x

def CQI_Prioritization(packets, default=True):
    '''
        Factors considered include: packet size, packet delay and retransmissions. 
        Emphasis is on maximizing throughput by sending the highest quality packets.
        Larger packets with smaller delays and lower retransmission rates are prioritized. 
    '''
    def calc_CQI(packet):
        # logarithm of CQI
        if default:
            cqi = log10(limit_of_zero(packet["header"][8])) + log10(limit_of_zero(safely_divide(effective_delay_budget, packet["header"][0]))) + log10(limit_of_zero((1 - packet["header"][4]/retransmission_limit), True))
        else:
            cqi = log10(limit_of_zero(packet["header"][8])) - log10(limit_of_zero(safely_divide(effective_delay_budget, packet["header"][0]))) - log10(limit_of_zero((1 - packet["header"][4]/retransmission_limit), True))
        return cqi 
    CQIs = [calc_CQI(packet) for packet in packets];
    CQIs_ = [calc_CQI(packet) for packet in packets];
    CQIs_.sort()
    CQIs_.reverse()
    prioritized = [packets[CQIs.index(CQI)] for CQI in CQIs_];
    return prioritized

def log(sessionId, request, response):
    # this is the logging function that produces color-coded records of events that occur in the network
    def format():
        colorMap = {
            "IP_PACKETS_RECEIVED": "yellow",
            "MAC_PACKETS_MODULATED": "cyan",
            "RETRANSMITTED_PACKET": "orange",
            "QUEUED_PACKET": "green",
            "REJECTED_PACKET": "red",
            "SORTED_PACKET": "pink",
            "SCHEDULER_EMPTY_STATE" : "yellow",
            "SCHEDULER_ALLOCATED_STATE" : "cyan",
            "SCHEDULED_PACKETS" : "orange"
        }
        return str(now()), sessionId, colorMap[request], request, response
    Log = read_netbuffer("NetLog", "log")
    if Log:
        Log.append(format())
    else:
        Log = [format()]
    write_netbuffer("NetLog", "log", Log)
    return None

#-------------- Component Data Models --------------

AirInterface = NetworkDataManager("AirInterface") # Handles initial packets entering the network
PhysicalUplinkControlChannel = NetworkDataManager("PhysicalUplinkControlChannel") # Modulates IP packets to MAC packets
MAC = NetworkDataManager("MAC") # validates packets and handles retransmissions or queueing of verified packets
Scheduler = NetworkDataManager("Scheduler") # sorts verified packets and schedules transmission of packets
Transmission = {
        "RR" : { "locked" : None, "packets" : [], "data" : [], "size" : 0 },
        "PF" : { "locked" : None, "packets" : [], "data" : [], "size" : 0 },
        "NV" : { "locked" : None, "packets" : [], "data" : [], "size" : 0 }
}
register_new_netbuffer("AirInterface", "UERegister", [])
register_new_netbuffer("PhysicalUplinkControlChannel", "QueuedMACPackets", [])
register_new_netbuffer("MAC", "TransmissionQueue", [])
register_new_netbuffer("MAC", "RejectedPackets", [])
register_new_netbuffer("Scheduler", "SortedPackets", {})

def transmit(locked, scheduler, packet):
    # transmits and terminates scheduled packets
    # old pkt loss: packet_duplication*packet["header"][7] - 1
    global Transmission
    scheduler_delay = ms_elapsed(packet["header"][-1]);
    matching_index = None
    if (len(Transmission[scheduler]["data"]) == 0):
        Transmission[scheduler]["data"].append({
            "sessionId" : locked,
            "QoS" : {
                 "packets_received" : 1,
                 "total_packet_delay" : packet["header"][0],
                 "total_retransmissions" : packet["header"][4],
                 "total_scheduler_delay" : scheduler_delay,
                 "total_packet_size" : packet["header"][8],
                 "lost_packets" : len([packet for packet in read_netbuffer("MAC", "RejectedPackets") if packet["sessionId"] == locked])
            }
        })
    else:
        matching = [Transmission[scheduler]["data"].index(data) for data in Transmission[scheduler]["data"] if data["sessionId"] == locked]
        if matching:
            matching_index = matching[0];
            Transmission[scheduler]["data"][matching_index]["QoS"]["packets_received"]+=1
            Transmission[scheduler]["data"][matching_index]["QoS"]["total_packet_delay"]+=packet["header"][0]
            Transmission[scheduler]["data"][matching_index]["QoS"]["total_retransmissions"]+=packet["header"][4]
            Transmission[scheduler]["data"][matching_index]["QoS"]["total_scheduler_delay"]+=scheduler_delay
            Transmission[scheduler]["data"][matching_index]["QoS"]["total_packet_size"] += packet["header"][8]
            Transmission[scheduler]["data"][matching_index]["QoS"]["lost_packets"] = len([packet for packet in read_netbuffer("MAC", "RejectedPackets") if packet["sessionId"] == locked])
        else:
            Transmission[scheduler]["data"].append({
                "sessionId" : locked,
                "QoS" : {
                     "packets_received" : 1,
                     "total_packet_delay" : packet["header"][0],
                     "total_retransmissions" : packet["header"][4],
                     "total_scheduler_delay" : scheduler_delay,
                     "total_packet_size" : packet["header"][8],
                     "lost_packets": len([packet for packet in read_netbuffer("MAC", "RejectedPackets") if packet["sessionId"] == locked])
                }
            })
    Transmission[scheduler]["size"] += packet["header"][8]
    return 200

NetLog = NetworkDataManager("NetLog") # records events in the network

#-------------- Network Endpoints --------------

# inspect data structures
@app.route("/SubNetworkLTE/Internal/Inspect/<path:section>")
def InspectData(section):
    payload = {
        "UERegister" : read_netbuffer("AirInterface", "UERegister"),
        "QueuedMACPackets" : read_netbuffer("PhysicalUplinkControlChannel", "QueuedMACPackets"),
        "TransmissionQueue" : read_netbuffer("MAC", "TransmissionQueue"),
        "RejectedPackets" : read_netbuffer("MAC", "RejectedPackets"),
        "SortedPackets" : read_netbuffer("Scheduler", "SortedPackets"),
        "Transmission" : Transmission,
        "Pending": len(read_netbuffer("PhysicalUplinkControlChannel", "QueuedMACPackets")),
        "Rejected": [packet["sessionId"] for packet in read_netbuffer("MAC", "RejectedPackets")]
    }
    if section == "all":
        selection = payload
    else:
        selection = payload[section]
    return responsify(200, "%s data attached" % section, selection)

# Reset
@app.route("/SubNetworkLTE/Reset")
def Reset():
    return str(reset_network())

# schedule packets
@app.route("/SubNetworkLTE/Scheduler/Schedule")
def SchedulePackets():
    global Transmission, scheduler_events
    def Schedule(scheduler):
        locked = Transmission[scheduler]["locked"]
        packets = Transmission[scheduler]["packets"]
        if scheduler == "RR":
            # check size constraint
            total_size = sum([packet["header"][-2] for packet in packets]);
            if (total_size <= transmission_bit_limit_per_tti):
                # send all packets on FIFO basis
                group = packets[::-1]; group_size = total_size
                process = [transmit(locked, scheduler, packet) for packet in group];
            else:
                # audit and send on FIFO basis
                while len(packets) > 0:
                    group = []; group_size = 0; proceed = True
                    while (group_size <= transmission_bit_limit_per_tti and proceed):
                        if len(packets) > 0:
                            packet = packets.pop()
                            group_size += packet["header"][-2]
                            group.append(packet)
                        else:
                            proceed = False
                    # send group
                    process = [transmit(locked, scheduler, packet) for packet in group];
        if scheduler == "PF":
            # packet CQI Prioritization
            packets = CQI_Prioritization(packets);
            # check size constraint
            total_size = sum([packet["header"][-2] for packet in packets]);
            if (total_size <= transmission_bit_limit_per_tti):
                # send all packets after CQI prioritization
                group = packets; group_size = total_size
                process = [transmit(locked, scheduler, packet) for packet in group];
            else:
                # audit and send on CQI basis
                while len(packets) > 0:
                    group = []; group_size = 0; proceed = True
                    while (group_size <= transmission_bit_limit_per_tti and proceed):
                        if len(packets) > 0:
                            packet = packets.pop(0)
                            group_size += packet["header"][-2]
                            group.append(packet)
                        else:
                            proceed = False
                    # send group
                    process = [transmit(locked, scheduler, packet) for packet in group];
        if scheduler == "NV":
            # packet CQI Prioritization (size only)
            packets = CQI_Prioritization(packets, False)
            # check size constraint
            total_size = sum([packet["header"][-2] for packet in packets])
            if (total_size <= transmission_bit_limit_per_tti):
                # send all packets after CQI prioritization
                group = packets
                group_size = total_size
                process = [transmit(locked, scheduler, packet) for packet in group]
            else:
                # audit and send on CQI basis
                while len(packets) > 0:
                    group = []
                    group_size = 0
                    proceed = True
                    while (group_size <= transmission_bit_limit_per_tti and proceed):
                        if len(packets) > 0:
                            packet = packets.pop(0)
                            group_size += packet["header"][-2]
                            group.append(packet)
                        else:
                            proceed = False
                    # send group
                    process = [transmit(locked, scheduler, packet) for packet in group]
        log(locked, "SCHEDULED_PACKETS", "%s packets with total size: %s bits were scheduled by: %s" % (len(group), group_size, scheduler))
        return "%s: %s" % (200, "Packets were scheduled (%s bits)" % group_size)
    def isolate_free_MAC_packets(isolated=None):
        SortedPackets = read_netbuffer("Scheduler", "SortedPackets");
        if not isolated:
            packets = [];
            for sessionId in SortedPackets:
                if not SortedPackets[sessionId]["busy"]:
                    isolated = sessionId
                    SortedPackets[sessionId]["busy"] = True;  # lock this queue
                    break;
        try:
            # detach packets
            packets = SortedPackets[isolated]["packets"]
            SortedPackets[isolated]["packets"] = []
        except:
            pass
        # update SortedPackets
        write_netbuffer("Scheduler", "SortedPackets", SortedPackets);
        return isolated, packets
    try:
        scheduler_events+=1
        schedulers = ["RR", "PF", "NV"]
        scheduler = schedulers[scheduler_events % len(schedulers)]
        # allocation
        locked, packets = isolate_free_MAC_packets()
        # register on Transmission
        Transmission[scheduler]["locked"] = locked
        Transmission[scheduler]["packets"] = packets
        log(locked, "SCHEDULER_ALLOCATED_STATE", "Scheduler: %s has been allocated %s packets" % (scheduler, len(packets)))
        return Schedule(scheduler)
    except Exception as e:
        print("Error @ scheduler : %s" % str(e))
        return "%s: %s" % (400, str(e))

# simulation agent firing mechanism for returning activity logs
@app.route("/SubNetworkLTE/NetLog")
def ShowActivity():
    Log = read_netbuffer("NetLog", "log")
    if Log:
        html = '<html><meta http-equiv="refresh" content="5"><body bgcolor="black"><div style="color: white; font-family: consolas; font-size:12;">%s</div></body></html>'
        spool = ""; count = -1
        for log in Log[::-1]:
            count+=1
            spool += '<p><b>%s --> </b>[%s] <span style="color: %s;">[%s]</span> [%s]' % log + ' (#%s)</p>' % str(len(Log) - count)
        return html % spool
    else:
        return "%s: %s" % (404, "No activity logs found")

# simulation agent firing mechanism for sorting verified packets
@app.route("/SubNetworkLTE/Scheduler/Sorter")
def SortPackets():
    try:
        TransmissionQueue = read_netbuffer("MAC", "TransmissionQueue")
        packet = TransmissionQueue.pop()  # release a MAC packet
        # add scheduler start
        packet["header"].append(now())
        write_netbuffer("MAC", "TransmissionQueue", TransmissionQueue)
        sessionId = packet["sessionId"]
        SortedPackets = read_netbuffer("Scheduler", "SortedPackets")
        if SortedPackets:
            if sessionId in SortedPackets:
                SortedPackets[sessionId]["packets"].insert(0, packet)
            else:
                SortedPackets[sessionId] = { "busy" : False, "packets" : [packet] }
        else:
            SortedPackets = {sessionId: { "busy" : False, "packets" : [packet] }}
        write_netbuffer("Scheduler", "SortedPackets", SortedPackets)
        log(sessionId, "SORTED_PACKET", "1 packet with id: %s was sorted (%s bits)" % (packet["header"][5], packet["header"][8]))
        return "%s: %s" % (201, "Packet was sorted (%s bits)" % packet["header"][8])
    except Exception as e:
        print("Error @ sorter : %s" % str(e))
        return "%s: %s" % (404, "No packet found")

# simulation agent firing mechanism for validating packet integrity
@app.route("/SubNetworkLTE/MAC/Profiler")
def ProfilePackets():
    def retransmit(packet):
        # check if retransmission_limit reached
        if packet["header"][4] + 1 > retransmission_limit:
            # reject this MAC packet
            RejectedPackets = read_netbuffer("MAC", "RejectedPackets")
            if RejectedPackets:
                RejectedPackets.append(packet)
            else:
                RejectedPackets = [packet]
            write_netbuffer("MAC", "RejectedPackets", RejectedPackets)
            log(packet["sessionId"], "REJECTED_PACKET", "1 packet with id: %s was rejected (%s bits)" % (packet["header"][5], packet["header"][8]))
            return "%s: %s" % (204, "Packet was rejected (%s bits)" % packet["header"][8])
        else:
            packet["header"][4]+=1
            retransmitted_session = MAC2IPSession(packet) # convert MAC packet back to IP session
            UERegister = read_netbuffer("AirInterface", "UERegister")
            if UERegister:
                UERegister.append(retransmitted_session)  # lower priority for unvalidated retransmitted packets
            else:
                UERegister = [retransmitted_session]
            write_netbuffer("AirInterface", "UERegister", UERegister) # retransmit IP session
            log(packet["sessionId"], "RETRANSMITTED_PACKET", "1 packet with id: %s was retransmitted (%s bits)" % (packet["header"][5], packet["header"][8]))
            return "%s: %s" % (200, "Packet was retransmitted (%s bits)" % packet["header"][8])
    def queue(packet):
        TransmissionQueue = read_netbuffer("MAC", "TransmissionQueue")
        if TransmissionQueue:
            TransmissionQueue.insert(0, packet)  # FIFO
        else:
            TransmissionQueue = [packet]
        write_netbuffer("MAC", "TransmissionQueue", TransmissionQueue) # queue this transmittable MAC packet
        log(packet["sessionId"], "QUEUED_PACKET", "1 packet with id: %s was queued (%s bits)" % (packet["header"][5], packet["header"][8]))
        return "%s: %s" % (201, "Packet was queued (%s bits)" % packet["header"][8])
    try:
        QueuedMACPackets = read_netbuffer("PhysicalUplinkControlChannel", "QueuedMACPackets")
        packet = QueuedMACPackets.pop() # release a MAC packet
        write_netbuffer("PhysicalUplinkControlChannel", "QueuedMACPackets", QueuedMACPackets)
        # test MAC packet for errors, handle contextually
        if packet["payload_bits"] == packet["header"][3]:
            return queue(packet)
        else:
            return retransmit(packet)
    except Exception as e:
        print("Error @ profiler : %s" % str(e))
        return "%s: %s" % (404, "No packet found")

# simulation agent firing mechanism for transcoding IP packets to MAC packets
@app.route("/SubNetworkLTE/PhysicalUplinkControlChannel/Modulation")
def ModulatePackets():
    session = None
    UERegister = read_netbuffer("AirInterface", "UERegister")
    if UERegister:
        session = UERegister.pop()
        write_netbuffer("AirInterface", "UERegister", UERegister)
        ip_address, session_time, sessionId, n_packets, ip_packets_loggable = session
        ip_packets = [log for log in ip_packets_loggable]
        # Packet Modulation
        delay = ms_elapsed(session_time); modulated = 0
        for packet in ip_packets:
            delay+=packet["header"][3]  # add retransmission delay
            mod_started = now()
            MAC_packets = []
            packetId = Id()
            field = transcode_bits(packet["payload_bits"], transcoding_plan(packet["header"][0], MAC_packet_size))
            packet_index = -1
            for band in field:
                packet_index+=1
                source_bits, trans_bits = band
                mod_delay = ms_elapsed(mod_started); delay+=mod_delay # add modulation delay
                # FIFO Queue, preserve retransmissions
                MAC_packets.insert(0, MAC_Packet(sessionId, trans_bits, ip_address, delay, source_bits, packet["header"][4], packetId, packet_index, len(field), len(trans_bits)))
            modulated+=len(MAC_packets)
            QueuedMACPackets = read_netbuffer("PhysicalUplinkControlChannel", "QueuedMACPackets")
            if QueuedMACPackets:
                QueuedMACPackets = MAC_packets + QueuedMACPackets # ensure FIFO
            else:
                QueuedMACPackets = MAC_packets
            write_netbuffer("PhysicalUplinkControlChannel", "QueuedMACPackets", QueuedMACPackets)
            log(sessionId, "MAC_PACKETS_MODULATED", "%s MAC packets from session %s delayed %sms" % (len(MAC_packets), sessionId, mod_delay))
        return "%s: %s" % (200, "Successfully modulated %s packets" % modulated)
    else:
        return "%s: %s" % (404, "No session found")

# simulation agent firing mechanism for authenticating UE sessions and receiving IP packets
@app.route("/SubNetworkLTE/AirInterface/UERegistration/<path:n_packets>")
def UERegistration(n_packets):
    ip_address = request.remote_addr
    try:
        session = UESession(ip_address, int(n_packets))
    except Exception as e:
        print("Error @ create_session : %s" % str(e))
        return "%s: %s" % (400, "Error creating session: packet_size not specified")
    UERegister = read_netbuffer("AirInterface", "UERegister")
    if UERegister:
        UERegister.insert(0, session)  #FIFO Queue
    else:
        UERegister = [session]
    write_netbuffer("AirInterface", "UERegister", UERegister)
    log(session[2], "IP_PACKETS_RECEIVED", 'UE at <span style="color: cyan;">%s</span> sent %s IP packets of %s bits' % (ip_address, n_packets, sum([this_packet["header"][0] for this_packet in session[4]])))
    return "%s: %s" % (200, "Successfully registered %s packets" % n_packets)

if __name__ == "__main__":
    app.run(host=server_host, port=server_port, threaded=True)
