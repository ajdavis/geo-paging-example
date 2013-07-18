import csv
import re
from bson import SON

from pymongo import MongoClient
import sys

collection = MongoClient().test.cafes

print('Dropping test.cafes collection')
collection.drop()

# Pattern matching simple decimal numbers.
float_pat = r'-?[0-9]+(\.[0-9]+)?'

# Pattern matching addresses, which are like:
# '123 MAIN ST (40.73, -73.98)'
location_pat = re.compile(
    r'(?P<address>(.|\n)+)\n\((?P<lat>%s), (?P<lon>%s)' % (
        float_pat, float_pat),
    re.MULTILINE)

csv_file = csv.DictReader(open('sidewalk-cafes.csv'))
n_lines = 0
batch = []
for line in csv_file:
    location_field = line.pop('Location 1')
    match = location_pat.match(location_field)
    assert match, repr(location_field)
    group_dict = match.groupdict()
    lon, lat = float(group_dict['lon']), float(group_dict['lat'])
    line['location'] = SON([
        ('type', 'Point'),
        ('coordinates', [lon, lat])])

    batch.append(line)
    n_lines += 1
    if not n_lines % 100:
        collection.insert(batch)
        batch = []
        sys.stdout.write('.')
        sys.stdout.flush()

# Final documents.
if batch:
    collection.insert(batch)

print('')
print('Inserted %s documents.' % n_lines)
print('Creating 2dsphere index.')
collection.create_index([('location', '2dsphere')])
print('Done.')
