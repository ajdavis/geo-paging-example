import urllib
from bson import ObjectId
from flask import Flask, redirect, url_for
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
@app.route(
    '/near/<float:lat>/<float:lon>/page/<int:page>/min/<float:min_distance>/last_id/<last_id>')
def near(lat, lon, page=1, min_distance=0, last_id=None):
    results_per_page = 10

    if last_id:
        query = {'_id': {'$ne': ObjectId(last_id)}}
    else:
        query = {}

    # NOTE: lon, lat order!!
    results = db.command(
        'geoNear', 'cafes',
        near={'type': 'Point', 'coordinates': [lon, lat]},
        query=query,
        spherical=True,
        num=results_per_page,
        minDistance=min_distance
    )['results']

    if results:
        last_result = results[-1]
        next_min_distance = last_result['dis']
        last_id = last_result['obj']['_id']
    else:
        next_min_distance = min_distance
        last_id = None

    start_url = url_for('near', lat=lat, lon=lon)

    next_url = url_for(
        'near', lat=lat, lon=lon, page=(page + 1),
        min_distance=next_min_distance, last_id=last_id)

    return render_template(
        'near.html', results=results, lat=lat, lon=lon, page=page,
        results_per_page=results_per_page,
        start_url=start_url, next_url=next_url)


@app.route('/address', methods=['POST'])
def address():
    lat, lon = address_to_lat_lon(request.form.get('address'))
    return redirect(url_for('near', lat=lat, lon=lon))


@app.route('/')
def main():
    return render_template('main.html')


if __name__ == '__main__':
    app.run(debug=True)
