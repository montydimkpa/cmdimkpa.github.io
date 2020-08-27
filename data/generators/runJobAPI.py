# runJob API

from flask import Flask, request, Response
from flask_cors import CORS
import requests as http
import pymssql
import datetime
import json

global false, true, null, conn, cursor

false = False
true = True
null = None

app = Flask(__name__)
CORS(app)

def now():
    return datetime.datetime.today()

def elapsed_seconds(t):
    return (now() - t).total_seconds()

def runJob(job):
    try:
        conn = pymssql.connect(user="SA",password="Photon86$",host="localhost",database="PrestoDBTest")
        cursor = conn.cursor()
        cursor.execute('USE PrestoDBTest;')
        if not job["use_presto"]:
            sql_query = job["sql_query"]
            if sql_query[-1] != ';':
                sql_query+=';'
            print(sql_query)
            cursor.execute(sql_query)
            return [str(x) for x in cursor.fetchall()]
        else:
            return []
        del conn
        del cursor
    except Exception as err:
        print(str(err))
        return []

@app.route('/PrestoDBTest/api/v1/runJob', methods=["POST"])
def newJob():
    req = request.get_json(force=True)
    job = req["job"]
    started = now()
    result = runJob(job)
    print(result)
    elapsed = elapsed_seconds(started)
    return http.post('https://ods-gateway.herokuapp.com/ods/new_record', json.dumps({
        "tablename" : "PrestoDBTest-Outgoing",
        "data" : {
            "result" : result,
            "elapsed" : elapsed
        }
    }), headers={"Content-Type" : "application/json"}).content

if __name__ == "__main__":
    app.run(port=2727, threaded=True)
