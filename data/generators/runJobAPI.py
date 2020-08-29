# runJob API

from flask import Flask, request, Response
from flask_cors import CORS
import requests as http
import pymssql
import datetime
import json
import prestodb

global false, true, null, conn, cur

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
        sql_query = job["sql_query"]
        if job["use_presto"]:
            conn = pymssql.connect(user="SA",password="Photon86$",host="localhost",database="presto_db_test")
        else:
            conn = prestodb.dbapi.connect(host='localhost',port=8080,user='SA',catalog='sqlserver',schema='dbo')
        cur = conn.cursor()
        cur.execute('USE presto_db_test')
        cur.execute(sql_query)
        result = cur.fetchall()
        if job["use_presto"]:
            result = [str(x) for x in result]
        del conn
        del cur
        return result
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
