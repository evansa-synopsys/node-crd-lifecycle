const express = require('express');
const app = express();
const path = require('path');
const got = require('got');
require('dotenv').config()
const { google } = require('googleapis');
const sqlAdmin = google.sqladmin('v1beta4');

const token = process.env.TOKEN;

// http server setup

app.use(express.json());
app.use('/static', express.static(path.join(__dirname, 'client', 'build', 'static')));

const tokenIsInvalid = (req, res) => {
    const rgbToken = req.get('rgb-token');
    console.log("server token is " + token + ";  request token is " + rgbToken);
    if (!rgbToken || rgbToken !== token) {
        return res.status(403).json({ error: 'Token is either null or invalid' });
    }
}

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'client', 'build', 'index.html'));
});

app.listen(3001, () => console.log('Node server running on port 3001'))


// http client

// TODO read from config map
const baseUrl = "http://35.202.46.218:15472";
//const baseUrl = "http://cn-crd-controller:15472";
const urls = {
    "crudHub": `${baseUrl}/hub`,
    "getModel": `${baseUrl}/model`
};

function getModel() {
    return got(urls.getModel, { json: true });
}

function createHub(body) {
    return got.post(urls.crudHub, { json: true, body });
}

function deleteHub(body) {
    return got.delete(urls.crudHub, body);
}

// business logic

function sum(nums) {
  return nums.reduce((b, a) => b + a, 0);
}

function getPodsNotRunningCount(podStatuses) {
    const counts = Object.keys(podStatuses)
        .map(function (k) {
            if (k === "Running") {
                return 0;
            }
            return podStatuses[k].length;
        });
    return sum(counts);
}

//TODO: use reduce
function getBadEventsCount(events) {
  let total = 0;
  for (var key in events) {
    if (key !== "Running") {
      total += events[key];
    }
  }
  return total;
}

// more routes for http server

app.get('/api/instances', (req, res) => {
    console.log(new Date());
    if (!tokenIsInvalid(req, res)) {
        getModel()
            .then((resp) => {
                res.setHeader('Content-Type', 'application/json');
                res.status(200);
                // res.send(JSON.stringify(resp.body));
                res.send(resp.body);
            })
            .catch((error) => {
                console.log(error);
                res.status(500);
                res.send(error.toString());
            })
    }
})

app.post('/api/instances', (req, res) => {
    if (!tokenIsInvalid(req, res)) {
        createHub(req.body)
            .then((resp) => {
                res.status(200);
                res.send('Hub instance created');
            })
            .catch((error) => {
                console.log(error);
                res.status(500);
                res.send(error.toString());
            })
    }
})

// TODO could/should these be pulled in from cn-crd-controller?
app.get('/api/sql-instances', (req, res) => {
    console.log(new Date());
    if (!tokenIsInvalid(req, res)) {
        authorize(function(authClient) {
          var request = {
            project: 'gke-verification',
            auth: authClient,
          };

          var handlePage = function(err, response) {
            if (err) {
              console.error(err);
              return res.status(500).json({ error: 'SQL Instances failed to load, blame Google' });
            }

            const dbInstances = response.data.items.map((instance) => instance.name);
            res.setHeader('Content-Type', 'application/json');
            res.send(JSON.stringify(dbInstances));
            //TODO: check for multiple pages
            // if (response.nextPageToken) {
            //   request.pageToken = response.nextPageToken;
            //   sqlAdmin.instances.list(request, handlePage);
            // }
          };

          sqlAdmin.instances.list(request, handlePage);
        });
    }
})

function authorize(callback) {
  google.auth.getApplicationDefault(function(err, authClient) {
    if (err) {
      console.error('authentication failed: ', err);
      return;
    }
    if (authClient.createScopedRequired && authClient.createScopedRequired()) {
      var scopes = ['https://www.googleapis.com/auth/cloud-platform'];
      authClient = authClient.createScoped(scopes);
    }
    callback(authClient);
  });
}
