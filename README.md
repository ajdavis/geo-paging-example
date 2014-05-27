geo-paging-example
==================

Example of using MongoDB's new `minDistance` option for paging through geo results.
Pages through search results for sidewalk cafés near your address.

(Café data from [NYC Open Data](https://data.cityofnewyork.us/Business/Sidewalk-Cafes/6k68-kc8u).)

Read my [blog post](http://emptysqua.re/blog/paging-geo-mongodb/) describing the technique.

Setup
-----
Install and run a local [MongoDB](http://www.mongodb.org/downloads) server, at least version 2.5.1.

(Pre-2.5.1 MongoDB versions ignore `minDistance`, so this paging technique won't work with them.)

Install the Python packages in `requirements.txt`.

Run `python load_cafes.py` from the project directory.

Run
---

Run `python server.py` from the project directory.

About
-----

Author: A. Jesse Jiryu Davis

Contributors: [Gianfranco Palumbo](https://github.com/gianpaj)
