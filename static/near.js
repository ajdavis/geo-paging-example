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
    // Each has id, seq, distance, name, and street.
    var rows = [],
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
                    row = {
                        id: obj._id['$oid'],
                        seq: rows.length + 1,
                        distance: result.dis,
                        name: name,
                        street: street
                    };

                rows.push(row);
            });

            callback();

        }).error(errback);
    }

    // Redisplay the table. Get more rows from server if necessary.
    function showPage(pageNo, callback) {
        function onRowsReady() {
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
                    callback();
                },
                function(jqXHR, textStatus, errorThrown) {
                    // Failure.
                    alert(errorThrown);
                    if (callback) callback();
                }
            );
        }
    }

    // Set up previous / next buttons.
    var $previous = $('#previous'), $next = $('#next');

    $previous.click(function() {
        if (pageNo == 1) return false;

        $next.addClass('disabled');
        $previous.addClass('disabled');

        showPage(--pageNo, function() {
            $next.removeClass('disabled');
            if (pageNo > 1) $previous.removeClass('disabled');
        });

        return false;
    });

    $next.click(function() {
        $next.addClass('disabled');
        $previous.addClass('disabled');

        showPage(++pageNo, function() {
            $previous.removeClass('disabled');
            $next.removeClass('disabled');
        });

        return false;
    });

    // Initial display.
    $previous.addClass('disabled');
    $next.addClass('disabled');
    showPage(1, function() {
        $next.removeClass('disabled');
    });
});
