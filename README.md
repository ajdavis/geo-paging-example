geo-paging-example
==================

Example of using MongoDB's new $minDistance option for paging through geo results.
Pages through search results for sidewalk cafés near your address.

(Café data from [NYC Open Data](https://data.cityofnewyork.us/Business/Sidewalk-Cafes/6k68-kc8u).)

Setup
-----
Install and run a local [MongoDB](http://www.mongodb.org/downloads) server, at least version 2.5.1.

Install the Python packages in `requirements.txt`.

Run `python load_cafes.py` from the project directory.

Run
---

Run `python server.py` from the project directory.
