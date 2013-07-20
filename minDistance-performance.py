import pprint
import random
import time

from pymongo import MongoClient


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

skip2ms_and_dupes = {}
# trials = 5
trials = 1

for trial in range(trials):
    print trial
    min_distance = 0.0
    last_ids = []
    seen_ids = set()
    for skip in range(0, 10000, 100):
        assert len(seen_ids) == skip, 'Skip = %d, got %d ids' % (
            skip, len(seen_ids))

        start = time.time()
        result = db.command(
            'geoNear', 'collection',
            near={
                'type': 'Point',
                'coordinates': [
                    -73.991084,
                    40.735863]},
            spherical=True,
            minDistance=min_distance,
            query={
                '_id': {'$nin': last_ids}
            },
            num=100)

        duration = time.time() - start
        # if trial == 0:
        #     print('skip: %d' % skip)
        #     print('duration: %.2fms' % (duration * 1000))
        #     print('minDistance: %.2fms' % min_distance)
        #     pprint.pprint(result['stats'])

        assert len(result['results']) == 100
        new_ids = set(r['obj']['_id'] for r in result['results'])
        assert not seen_ids.intersection(new_ids)
        new_min_distance = result['results'][-1]['dis']
        if new_min_distance == min_distance:
            # We're still paging through results all at the same distance.
            last_ids += [r['obj']['_id'] for r in result['results']]
        else:
            # Results in this page are farther than previous page.
            min_distance = new_min_distance
            last_ids = [
                r['obj']['_id'] for r in result['results']
                if r['dis'] == min_distance]

        skip2ms_and_dupes.setdefault(skip, [0, 0])
        skip2ms_and_dupes[skip][0] += duration * 1000
        if trial == 0:
            skip2ms_and_dupes[skip][1] = len(last_ids)

        for r in result['results']:
            seen_ids.add(r['obj']['_id'])

    assert len(seen_ids) == 10000, 'Got %d ids' % len(seen_ids)

for skip in sorted(skip2ms_and_dupes):
    avg_duration = skip2ms_and_dupes[skip][0] / trials
    dupes = skip2ms_and_dupes[skip][1]
    # print '%d, %.2f, %d' % (skip, avg_duration, dupes)
    print '%d, %.2f' % (skip, avg_duration)
