# create some sample data tables
# Users table
# Products table
# Sales table

from random import random
from hashlib import md5
import os

user_names = {
    "first" : [
        'John',
        'Samuel',
        'Sarah',
        'Tomiwa',
        'Joro',
        'Kofi',
        'Amanda',
        'Omosolape',
        'Aminat',
        'Kendra',
        'Kingsley',
        'Emeka',
        'Casper',
        'Etim',
        'Bassey',
        'Idris',
        'Ralph',
        'Sylvester',
        'Jaja',
        'Tekena'
    ],
    "last": [
        'Sarpong',
        'Ameh',
        'Akenzua',
        'Ofili',
        'Okoro',
        'Affiah',
        'Adebayo',
        'Terwase',
        'Baba',
        'Peter',
        'Awuzie',
        'Izibili',
        'Makinde',
        'Johnson',
        'Terver',
        'Akinde',
        'Prosper',
        'Matthews',
        'Coker',
        'Paul'
    ]
}

product_names = {
    "brand": [
        'Arla',
        'Kopik',
        'Flint',
        'WholeFoods',
        'Kazoo'
    ],
    "category": [
        'Bread',
        'Milk',
        'Yoghurt',
        'Greens',
        'Sauce'
    ],
    "subcategory" : [
        "50L",
        "fat-free",
        "iodized 20L",
        "Assorted Large",
        "Export quality"
    ]
}

global users, num_users, products, num_products, transactions, HOME, slash

users = []
num_users = 400
products = []
num_products = 100
transactions = []
HOME = os.getcwd()
if "\\" in HOME:
    slash = "\\"
else:
    slash = "/"
HOME+=slash

def random_from(array):
    ptr = int(random()*len(array))
    return array[ptr]

def random_array_from(array, size):
    return [random_from(array) for i in range(size)]

def hash(x):
    hasher = md5(); hasher.update(str(x))
    return hasher.hexdigest()

def write2csv(collection, filename):
    if len(collection) > 2:
        file_ = HOME+"%s.csv" % filename
        try:
            os.remove(file_)
        except:
            pass
        h = open(file_, "a+")
        keys = collection[0].keys()
        header = ",".join(keys)
        h.write("%s\n" % header)
        for entry in collection[1:]:
            line = ",".join([str(entry[key]) for key in keys])
            h.write("%s\n" % line)
        h.close()
    return file_

while len(users) < num_users:
    username = "%s %s" % (random_from(user_names["first"]), random_from(user_names["last"]))
    if not [x for x in users if x["username"] == username]:
        users.append({
            "username" : username,
            "user_id": "".join(random_array_from([x for x in hash(username)], 10)),
            "age" : random_from(range(30,50))
        })

while len(products) < num_products:
    productname = "%s %s %s" % (random_from(product_names["brand"]), random_from(product_names["category"]), random_from(product_names["subcategory"]))
    if not [x for x in products if x["productname"] == productname]:
        products.append({
            "productname" : productname,
            "product_id": "".join(random_array_from([x for x in hash(username)], 20)),
            "price" : round(10.50 + random()*(249.99 - 10.50), 2)
        })

# story : every day, each customer goes to the store and can buy up to X items.

days = range(1,30)
for day in days:
    date = "08/%s/2020" % day
    for customer in users:
        selection = random_array_from(products, int(80 + random()*20))
        for product in selection:
            transactions.append({
                    "date" : date,
                    "customer_id" : customer["user_id"],
                    "product_id" : product["product_id"],
                    "price" : product["price"]
                })

print(write2csv(users, "users"))
print(write2csv(products, "products"))
print(write2csv(transactions, "transactions"))
