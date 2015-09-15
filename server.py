from math import isnan

from bson import ObjectId, json_util
from flask import Flask, redirect, url_for, Response, flash
from flask import render_template
from flask import request
import googlemaps
from pymongo import MongoClient
import sys
from werkzeug.routing import NumberConverter

db = MongoClient().test
app = Flask(__name__, static_path='/geopaging/static')

try:
    with open('google_api_key.txt') as f:
        google_api_key = f.read().decode().strip()
except IOError as error:
    print("Couldn't open google_api_key.txt, see README for config "
          "instructions: %s" % error)

    sys.exit(1)

gmaps = googlemaps.Client(key=google_api_key)


# Accept more 'float' numbers than Werkzeug does by default: also accept
# numbers beginning with minus, or with no trailing digits.
# From https://gist.github.com/akhenakh/3376839
class NegativeFloatConverter(NumberConverter):
    regex = r'\-?\d+(\.\d+)?'
    num_convert = float

    def __init__(self, mapping, minimum=None, maximum=None):
        NumberConverter.__init__(self, mapping, 0, minimum, maximum)


app.url_map.converters['float'] = NegativeFloatConverter


class NoResults(Exception):
    pass


def address_to_lat_lon(addr):
    geocode_result = gmaps.geocode(addr)
    if not geocode_result:
        raise NoResults
    loc = geocode_result[0]['geometry']['location']
    return loc['lat'], loc['lng']



@app.route('/geopaging/near/<float:lat>/<float:lon>')
def near(lat, lon):
    return render_template('near.html', results=results, lat=lat, lon=lon)


@app.route('/geopaging/results/json', methods=['POST'])
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


@app.route('/geopaging/address', methods=['POST'])
def address():
    query = request.form.get('address')
    try:
        lat, lon = address_to_lat_lon(query)
        return redirect(url_for('near', lat=lat, lon=lon))
    except NoResults:
        flash('No results for "%s"' % query)
        # Put user in the East Village.
        return redirect(url_for('near', lat=40.7275043, lon=-73.9800645))


@app.route('/geopaging')
def main():
    n_cafes = db.cafes.count()
    return render_template('main.html', n_cafes=n_cafes)


if __name__ == '__main__':
    print('Go visit http://localhost:5000/geopaging')
    app.secret_key = 'asdfasdf123'
    app.run(host='0.0.0.0')
