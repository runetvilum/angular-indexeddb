importScripts(
    '../lie/dist/lie.polyfill.min.js'
);
var openIndexedDBReq;

function open() {
    return Promise.resolve().then(function () {
        if (openIndexedDBReq) {
            // reuse the same event to avoid onblocked when deleting
            return openIndexedDBReq.result;
        }
        return new Promise(function (resolve, reject) {
            var req = openIndexedDBReq = indexedDB.open('egenkontrol');
            req.onblocked = reject;
            req.onerror = reject;
            req.onupgradeneeded = function (e) {
                console.log(e);
                var db = e.target.result;
                db.createObjectStore('cache', {
                    keyPath: 'i'
                });

            };
            req.onsuccess = function (e) {
                var db = e.target.result;
                resolve(db);
            };
        });
    });
}

function upgrade(dbs, version) {
    return new Promise(function (resolve, reject) {
        if (openIndexedDBReq) {
            // reuse the same event to avoid onblocked when deleting
            openIndexedDBReq.result.close();
        }
        var req = openIndexedDBReq = indexedDB.open('egenkontrol', version);
        req.onblocked = reject;
        req.onerror = reject;
        req.onupgradeneeded = function (e) {
            var db = e.target.result;
            if (typeof dbs === 'string') {
                dbs = [dbs];
            }
            for (var i = 0; i < dbs.length; i++) {
                db.createObjectStore(dbs[i], {
                    keyPath: '_id'
                });
            }


        }
        req.onsuccess = function (e) {
            var db = e.target.result;
            resolve(db);
        };
    });

}


function _cursor(db, name) {

    return new Promise(function (resolve, reject) {
        var transaction;
        if (transactions.hasOwnProperty(name)) {
            transaction = transactions[name];
        } else {
            transaction = db.transaction(name, 'readwrite');
        }
        var objectStore = transaction.objectStore(name);
        var request = objectStore.openCursor();
        var results = [];
        request.onsuccess = function (event) {
            var cursor = event.target.result;

            if (cursor) {
                results.push(cursor.value);
                cursor.continue();
            } else {
                resolve(results);
            }
        };
        request.onerror = reject;

    });

}

function _get(db, name, id) {

    return new Promise(function (resolve, reject) {
        var transaction = db.transaction(name, 'readonly');
        var objectStore = transaction.objectStore(name);
        var request = objectStore.get(id);
        request.onsuccess = function (event) {
            resolve(event.target.result);
        };
        request.onerror = reject;

    });

}

function _delete(db, name, id) {

    return new Promise(function (resolve, reject) {
        var transaction;
        if (transactions.hasOwnProperty(name)) {
            transaction = transactions[name];
        } else {
            transaction = db.transaction(name, 'readwrite');
        }
        var objectStore = transaction.objectStore(name);
        var request = objectStore.delete(id);
        request.onsuccess = function (event) {
            resolve(id);
        };
        request.onerror = reject;

    });

}

function _add(db, name, doc) {

    return new Promise(function (resolve, reject) {
        var transaction;
        if (transactions.hasOwnProperty(name)) {
            transaction = transactions[name];
        } else {
            transaction = db.transaction(name, 'readwrite');
        }
        var objectStore = transaction.objectStore(name);
        var request = objectStore.add(doc);
        request.onsuccess = function (event) {
            resolve(doc);
        };
        request.onerror = reject;

    });

}

function _put(db, name, doc) {

    return new Promise(function (resolve, reject) {
        var transaction;
        if (transactions.hasOwnProperty(name)) {
            transaction = transactions[name];
        } else {
            transaction = db.transaction(name, 'readwrite');
        }
        var objectStore = transaction.objectStore(name);
        var request = objectStore.put(doc);
        request.onsuccess = function (event) {
            resolve(doc);
        };
        request.onerror = reject;

    });

}

function _count(db, name, id) {
    return new Promise(function (resolve, reject) {
        var transaction = db.transaction(name, 'readonly');
        var objectStore = transaction.objectStore(name);
        var request = objectStore.count(id);
        request.onsuccess = function (event) {
            resolve(event.target.result);
        };
        request.onerror = reject;
    });
};

function _sequence(db, name) {
    return Promise.resolve().then(function () {
        for (var key in db.objectStoreNames) {
            if (db.objectStoreNames[key] === name) {
                return db;
            }
        }
        return upgrade(name, db.version + 1); //, createDatabases, createConfigurations);
    }).then(function (db) {
        return _count(db, 'databases', name).then(function (data) {

            if (data === 0) {
                return _add(db, 'databases', {
                    i: name,
                    s: '0'
                });
            } else {
                return _get(db, 'databases', name);
            }
        });
    })

};

function _createDB(db, dbs) {
    return Promise.resolve().then(function () {
        var createDatabases = true;

        for (var key in db.objectStoreNames) {
            var index = dbs.indexOf(db.objectStoreNames[key]);
            if (index !== -1) {
                dbs.splice(index, 1);
            }

        }
        if (dbs.length > 0) {
            return upgrade(dbs, db.version + 1);
        }
        return db
    });
};
var transactions = {};

self.addEventListener('message', function (e) {
    switch (e.data.action) {
    case 'sequence':
        Promise.resolve().then(function () {
            return open();
        }).then(function (db) {
            return _sequence(db, e.data.db);
        }).then(function (data) {
            self.postMessage(data);
        }).catch(function (e) {
            console.error('worker error', e);
            self.postMessage({
                error: e.message
            });
        });

        break;
    case 'count':
        Promise.resolve().then(function () {
            return open();
        }).then(function (db) {
            return _count(db, e.data.db, e.data.id);
        }).then(function (data) {
            self.postMessage(data);
        }).catch(function (e) {
            console.error('worker error', e);
            self.postMessage({
                error: e.message
            });
        });

        break;
    case 'delete':
        Promise.resolve().then(function () {
            return open();
        }).then(function (db) {
            return _delete(db, e.data.db, e.data.id);
        }).then(function (data) {
            self.postMessage(data);
        }).catch(function (e) {
            console.error('worker error', e);
            self.postMessage({
                error: e.message
            });
        });

        break;
    case 'add':
        Promise.resolve().then(function () {
            return open();
        }).then(function (db) {
            return _add(db, e.data.db, e.data.doc);
        }).then(function (data) {
            self.postMessage(data);
        }).catch(function (e) {
            console.error('worker error', e);
            self.postMessage({
                error: e.message
            });
        });

        break;
    case 'put':
        Promise.resolve().then(function () {
            return open();
        }).then(function (db) {
            return _put(db, e.data.db, e.data.doc);
        }).then(function (data) {
            self.postMessage(data);
        }).catch(function (e) {
            console.error('worker error', e);
            self.postMessage({
                error: e.message
            });
        });

        break;
    case 'get':
        Promise.resolve().then(function () {
            return open();
        }).then(function (db) {
            return _get(db, e.data.db, e.data.id);
        }).then(function (data) {
            self.postMessage(data);
        }).catch(function (e) {
            console.error('worker error', e);
            self.postMessage({
                error: e.message
            });
        });

        break;
    case 'cursor':
        Promise.resolve().then(function () {
            return open();
        }).then(function (db) {
            return _cursor(db, e.data.db);
        }).then(function (data) {
            self.postMessage(data);
        }).catch(function (e) {
            console.error('worker error', e);
            self.postMessage({
                error: e.message
            });
        });
        break;
    case 'createDB':
        Promise.resolve().then(function () {
            return open();
        }).then(function (db) {
            return _createDB(db, e.data.db);
        }).then(function (data) {
            self.postMessage({});
        }).catch(function (e) {
            console.error('worker error', e);
            self.postMessage({
                error: e.message
            });
        });
        break;
    }
});
