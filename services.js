angular.module('indexeddb', [])

.factory('idb', function () {
    var ready = true;
    var userWorker = navigator.userAgent.indexOf('Chrome') !== -1;
    var worker, workerPromise;

    var transactions = {};
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


    if (userWorker) {
        worker = new Worker('worker.js');
        workerPromise = function (message) {
            return new Promise(function (resolve, reject) {

                function cleanup() {
                    worker.removeEventListener('message', onSuccess);
                    worker.removeEventListener('error', onError);
                    ready = true;
                }

                function onSuccess(e) {
                    cleanup();
                    if (e.data && e.data.error) {
                        reject(e.data.error);
                    } else {
                        resolve(e.data);
                    }
                }

                function onError(e) {
                    //cleanup();
                    //reject(e);
                    setTimeout(function () {
                        resolve(workerPromise(message));
                    }, 100);
                }
                if (ready) {
                    ready = false;
                    worker.addEventListener('message', onSuccess);
                    worker.addEventListener('error', onError);
                    worker.postMessage(message);
                } else {
                    setTimeout(function () {
                        resolve(workerPromise(message));
                    }, 100);
                }
            });
        }

    } else {
        worker = function (data) {
            switch (data.action) {
            case 'sequence':
                return Promise.resolve().then(function () {
                    return open();
                }).then(function (db) {
                    return _sequence(db, data.db);
                });
                break;
            case 'count':
                return Promise.resolve().then(function () {
                    return open();
                }).then(function (db) {
                    return _count(db, data.db, data.id);
                });
                break;
            case 'delete':
                return Promise.resolve().then(function () {
                    return open();
                }).then(function (db) {
                    return _delete(db, data.db, data.id);
                });
                break;
            case 'add':
                return Promise.resolve().then(function () {
                    return open();
                }).then(function (db) {
                    return _add(db, data.db, data.doc);
                });
                break;
            case 'put':
                return Promise.resolve().then(function () {
                    return open();
                }).then(function (db) {
                    return _put(db, data.db, data.doc);
                });
                break;
            case 'get':
                return Promise.resolve().then(function () {
                    return open();
                }).then(function (db) {
                    return _get(db, data.db, data.id);
                });
                break;
            case 'cursor':
                return Promise.resolve().then(function () {
                    return open();
                }).then(function (db) {
                    return _cursor(db, data.db);
                });
                break;
            case 'createDB':
                return Promise.resolve().then(function () {
                    return open();
                }).then(function (db) {
                    return _createDB(db, data.db);
                });
                break;
            }
        };

        workerPromise = function (message) {
            //console.log(message);
            return new Promise(function (resolve, reject) {


                if (ready) {
                    ready = false;
                    worker(message).then(function (data) {
                        ready = true;
                        resolve(data);
                    }).catch(function (err) {
                        console.log(err);
                        setTimeout(function () {
                            resolve(workerPromise(message));
                        }, 100);
                    });
                } else {
                    setTimeout(function () {
                        resolve(workerPromise(message));
                    }, 10);
                }
            });
        }
    }
    return {
        sequence: function (db) {
            return workerPromise({
                action: 'sequence',
                db: db
            });
        },
        count: function (db, id) {
            return workerPromise({
                action: 'count',
                db: db,
                id: id
            });
        },
        put: function (db, doc) {
            return workerPromise({
                action: 'put',
                db: db,
                doc: doc
            });
        },
        add: function (db, doc) {
            return workerPromise({
                action: 'add',
                db: db,
                doc: doc
            });
        },
        delete: function (db, id) {
            return workerPromise({
                action: 'delete',
                db: db,
                id: id
            });
        },
        get: function (db, id) {
            return workerPromise({
                action: 'get',
                db: db,
                id: id
            });
        },
        cursor: function (db) {
            return workerPromise({
                action: 'cursor',
                db: db
            });
        },
        createDB: function (db) {
            return workerPromise({
                action: 'createDB',
                db: db
            });
        }
    }
});
