from collections import defaultdict
import random
from pymongo import MongoClient
import time

db = MongoClient().test

random.seed(1)
db = MongoClient().test
collection = db.collection
collection.drop()
for i in range(0, 10000, 1000):
    collection.insert([{
        'location': {
            'type': 'Point',
            'coordinates': [
                -73.991084 + 10 - random.random() * 20,
                40.735863 + 10 - random.random() * 20]}
    } for _ in range(1000)])

assert 10000 == collection.count()
collection.create_index([('location', '2dsphere')])

skip2ms = defaultdict(float)
trials = 5

for trial in range(trials):
    print trial
    for skip in range(0, 10000, 100):
        start = time.time()
        result = collection.aggregate([{
            '$geoNear': {
                'near': {
                    'type': 'Point',
                    'coordinates': [
                        -73.991084,
                        40.735863]},
                'spherical': True,
                'distanceField': 'dist',
                'num': skip + 100}
        }, {
            '$skip': skip
        }])
        duration = time.time() - start

        assert len(result['result']) == 100
        skip2ms[skip] += duration * 1000

for skip in sorted(skip2ms):
    avg_duration = skip2ms[skip] / trials
    print '%d, %.2f' % (skip, avg_duration)
