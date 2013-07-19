import urllib
from math import isnan

from bson import ObjectId, json_util
from flask import Flask, redirect, url_for, Response
from flask import render_template
from flask import request
from pymongo import MongoClient
from werkzeug.routing import NumberConverter

db = MongoClient().test
app = Flask(__name__)


# Accept more 'float' numbers than Werkzeug does by default: also accept
# numbers beginning with minus, or with no trailing digits.
# From https://gist.github.com/akhenakh/3376839
class NegativeFloatConverter(NumberConverter):
    regex = r'\-?\d+(\.\d+)?'
    num_convert = float

    def __init__(self, mapping, minimum=None, maximum=None):
        NumberConverter.__init__(self, mapping, 0, minimum, maximum)


app.url_map.converters['float'] = NegativeFloatConverter


def address_to_lat_lon(addr):
    url = 'http://maps.google.com/?q=' + urllib.quote(addr) + '&output=js'

    # Get XML location.
    xml = urllib.urlopen(url).read()

    if '<error>' in xml:
        raise Exception('%s\n' % url)
    else:
        # Strip lat/long coordinates from XML.
        center = xml[xml.find('{center')+9:xml.find('}', xml.find('{center'))]
        center = center.replace('lat:', '').replace('lng:', '')
        lat, lng = center.split(',')
        return float(lat), float(lng)


@app.route('/near/<float:lat>/<float:lon>')
def near(lat, lon):
    return render_template('near.html', results=results, lat=lat, lon=lon)


@app.route('/results/json', methods=['POST'])
def results():
    request_data = request.get_json()
    num = int(request_data['num'])
    skip_ids = [ObjectId(_id) for _id in request_data['skipIds']]
    min_distance = float(request_data['minDistance'])
    lat = float(request_data['lat'])
    lon = float(request_data['lon'])

    if skip_ids:
        query = {'_id': {'$nin': skip_ids}}
    else:
        query = {}

    # NOTE: lon, lat order!!
    result = db.command(
        'geoNear', 'cafes',
        near={'type': 'Point', 'coordinates': [lon, lat]},
        query=query,
        spherical=True,
        num=num,
        minDistance=min_distance
    )

    # Special case: if no results, avgDistance is NaN.
    if isnan(result['stats']['avgDistance']):
        result['stats']['avgDistance'] = 0

    return Response(
        json_util.dumps(result, allow_nan=False), mimetype='application/json')


@app.route('/address', methods=['POST'])
def address():
    lat, lon = address_to_lat_lon(request.form.get('address'))
    return redirect(url_for('near', lat=lat, lon=lon))


@app.route('/')
def main():
    n_cafes = db.cafes.count()
    return render_template('main.html', n_cafes=n_cafes)


if __name__ == '__main__':
    app.run(host='0.0.0.0')

