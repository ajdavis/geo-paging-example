$(function() {
    // CONFIGURATION.
    var rowsPerPage = 10;

    // See http://codepb.github.io/jquery-template/index.html
    $.addTemplateFormatter("toInt",
        function (value, template) {
            return value.toFixed(0);
        });

    // GLOBAL STATE.
    // Rows are kept sorted by distance.
    // Each has id, seq, distance, name, latlon, and street.
    var rows = [],
        map,
        mapMarkers = [],
        pageNo = 1,
        // Farthest row we've seen so far.
        maxDistance = 0;

    // Get at most 'num' rows from server, all at least 'maxDistance' away, and
    // append to global 'rows'. Update global 'maxDistance'.
    function getMoreRows(num, callback, errback) {
        // Exclude known rows at the current maxDistance so we don't get
        // dupes from server.
        var skipIds = [];
        for (
            var i = rows.length - 1;
            i >= 0 && rows[i].distance == maxDistance;
            i--
        ) {
            skipIds.push(rows[i].id);
        }

        $.ajax({
            url: '/results/json',
            type: 'post',
            contentType: 'application/json',

            data: JSON.stringify({
                lat: window.pageData.lat,
                lon: window.pageData.lon,
                minDistance: maxDistance,
                skipIds: skipIds,
                num: num
            })
        }).success(function(data) {
            if (data.results.length) {
                maxDistance = data.stats.maxDistance;
            }

            data.results.forEach(function(result) {
                var obj = result.obj,
                    name = (
                        obj['Camis Trade Name'] || obj['Entity Name']
                    ).toLocaleLowerCase(),
                    street = obj['Address Street Name'].toLocaleLowerCase(),
                    lonlat = obj.location.coordinates,
                    row = {
                        id: obj._id['$oid'],
                        seq: rows.length + 1,
                        distance: result.dis,
                        name: name,
                        street: street,
                        // Reorder the GeoJSON coordinates from server.
                        latlon: [lonlat[1], lonlat[0]]
                    };

                rows.push(row);
            });

            callback();

        }).error(errback);
    }

    function updateTable(pagingDirection) {
        var $resultsTable = $('#results');
        $resultsTable.find('tr').remove();
        $resultsTable.loadTemplate(
            '#result-template',
            rows,
            {
                paged: true,
                pageNo: pageNo,
                elemPerPage: rowsPerPage
            }
        );

        $('#page-number').html(pageNo.toString());
    }

    function updateMap(pagingDirection) {
        clearMapPoints();

        var points = $.map(
            rows.slice((pageNo - 1) * rowsPerPage, pageNo * rowsPerPage),
            function(row) {
                // map() would flatten [lat, lon], so nest it in another array.
                return [row.latlon];
            }
        );

        addPointsToMap(points);
        zoomMapToFit(points, pagingDirection);
    }

    // Redisplay the table and map. Get more rows from server if necessary.
    // pagingDirection is 'next' or 'previous'.
    function showPage(pageNo, pagingDirection, callback) {
        function onRowsReady() {
            updateTable(pagingDirection);
            updateMap(pagingDirection);
            if (callback) callback();
        }
        
        if (rows.length >= pageNo * rowsPerPage) {
            // We have enough rows already.
            onRowsReady();
        } else {
            getMoreRows(
                rowsPerPage,
                function() {
                    // Success.
                    onRowsReady();
                },
                function(jqXHR, textStatus, errorThrown) {
                    // Failure.
                    alert(errorThrown);
                    if (callback) callback();
                }
            );
        }
    }

    // Map stuff.
    function initializeMap() {
        var center = new google.maps.LatLng(window.pageData.lat, window.pageData.lon);
        var mapOptions = {
            zoom: 16,
            center: center,
            mapTypeId: google.maps.MapTypeId.ROADMAP
        };

        map = new google.maps.Map(
            document.getElementById('map-canvas'),
            mapOptions);

        // Center point.
        new google.maps.Marker({
            map: map,
            draggable: false,
            animation: google.maps.Animation.DROP,
            position: center
        });
    }

    google.maps.event.addDomListener(window, 'load', initializeMap);

    function clearMapPoints() {
        mapMarkers.forEach(function(marker) {
            marker.setMap(null);
        });

        mapMarkers = [];
    }

    // Add a list of [lat, lon] pairs.
    function addPointsToMap(points) {
        var circle = {
            path: google.maps.SymbolPath.CIRCLE,
              fillColor: "blue",
              fillOpacity: 0.5,
              scale: 6,
              strokeColor: "black",
              strokeWeight: 1
        };

        points.forEach(function(point) {
            var latlng = new google.maps.LatLng(point[0], point[1]),
                marker = new google.maps.Marker({
                    map: map,
                    draggable: false,
                    position: latlng,
                    icon: circle
                });

            mapMarkers.push(marker);
        });
    }

    // points is a list of [lat, lon]. pagingDirection is 'next' or 'previous'.
    function zoomMapToFit(points, pagingDirection) {
        // Not ready?
        if ( ! points.length || ! map.getBounds()) {
            // Try later.
            google.maps.event.addListenerOnce(map, 'idle', function(){
                zoomMapToFit(points, pagingDirection);
            });

            return;
        }

        var latLngs = $.map(points, function(point) {
            return new google.maps.LatLng(point[0], point[1]);
        });

        function fits() {
            for (var i = 0; i < latLngs.length; ++i) {
                if ( ! map.getBounds().contains(latLngs[i])) return false;
            }

            return true;
        }

        var zoom = map.getZoom(),
            mapType = map.mapTypes[map.mapTypeId];

        if (pagingDirection == 'next') {
            // Zoom out.
            while ( ! fits() && zoom >= 1) { map.setZoom(--zoom); }
        } else {
            // Zoom in.
            while (fits() && zoom <= mapType.maxZoom) { map.setZoom(++zoom); }

            // Don't zoom in too far.
            map.setZoom(--zoom);
        }
    }

    // Set up previous / next buttons.
    var $previous = $('#previous'), $next = $('#next');

    $previous.click(function() {
        if (pageNo == 1) return false;

        $next.addClass('disabled');
        $previous.addClass('disabled');

        showPage(--pageNo, 'previous', function() {
            $next.removeClass('disabled');
            if (pageNo > 1) $previous.removeClass('disabled');
        });

        return false;
    });

    $next.click(function() {
        $next.addClass('disabled');
        $previous.addClass('disabled');

        showPage(++pageNo, 'next', function() {
            $previous.removeClass('disabled');
            $next.removeClass('disabled');
        });

        return false;
    });

    // Initial display.
    $previous.addClass('disabled');
    $next.addClass('disabled');
    showPage(1, 'next', function() {
        $next.removeClass('disabled');
    });
});
