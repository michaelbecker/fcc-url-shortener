// server.js
// where your node app starts

const { URL } = require('url');
const express = require('express');
const mongodb = require("mongodb");
const stringHash = require("string-hash");

var app = express();
const MongoClient = mongodb.MongoClient;


// Pull this from our hidden env file.
const mongoDbUrl = process.env.MLAB_URI;
// And we need where this website is...
const ourUrl = "https://almond-editor.glitch.me";


// http://expressjs.com/en/starter/static-files.html
app.use(express.static('public'));

// http://expressjs.com/en/starter/basic-routing.html
app.get("/", function (request, response) {
  response.sendFile(__dirname + '/views/index.html');
});


//////////////////////////////////////////////////////////////////////
// Helper function for internal error reporting.
// This is only if something goes wrong here. This is not for 
// reporting expected user problems, like bad input data.
//////////////////////////////////////////////////////////////////////
function reportFatalError(response, str) {
  // Log it to the console, which in glitch goes to a log file...  
  console.log(str);
  // And send an error response back
  response.send(JSON.stringify({"error": str}));
}


//////////////////////////////////////////////////////////////////////
// If we can create a new url Object from the string, it can be 
// considered valid. We don't actually need the url object, but 
// we just return it anyway since it can be tested for t/f.
// Reference: https://nodejs.org/docs/latest/api/url.html
//////////////////////////////////////////////////////////////////////
function urlIsValid(urlStr) {
  var inputUrl = null;
  try {
    inputUrl = new URL(urlStr);
  }
  catch(e) {
  }
  return inputUrl;
}


//////////////////////////////////////////////////////////////////////
// Handle requesting a new short URL
// The regexs are a little weird with Express.
// Reference:
// The correct usage is in a comment at the end of this posting.
// https://stackoverflow.com/questions/42351738/dealing-with-slash-characters-in-request-parameter-using-express-route
//////////////////////////////////////////////////////////////////////
app.get("/new/:URL(*)", function (request, response) {

  if (!urlIsValid(request.params.URL) ){
    response.send(JSON.stringify({"error": "Invalid URL format"}));
    return;
  }
  
  MongoClient.connect(mongoDbUrl, function (err, database) {

    if (err) {
      reportFatalError(response, 'Internal error: unable to connect to the mongoDB server. ' + err);
      return;
    }
    
    // The API Changed between Mongo 2.x and 3.x.
    // Reference: https://stackoverflow.com/questions/43779323/typeerror-db-collection-is-not-a-function
    var db = database.db("fccprojects");

    // do some work here with the collection we are using for this project.
    var collection = db.collection("url-shortener");

    // Did we already shorten this URL?
    collection.find({"original_url": request.params.URL}).toArray( function (err, documents) {
      
      if (err) {
        reportFatalError(response, 'Internal error: Failed Mongo find. ' + err);
        database.close();
        return;
      }

      var reply;
      
      // Document exists already, just return what was already stored.
      if (documents.length > 0) {
        database.close();
        reply = {"original_url": request.params.URL,
                 "short_url": documents[0].short_url};
      }
      // This is a new URL, create a document and return it.
      else {
        var key = stringHash(request.params.URL);
      
        reply = {"original_url": request.params.URL,
                 "short_url": ourUrl + "/r/" + key,
                 "key": key};
        
        collection.insert(reply, function (err, data) {
          if (err) {
            reportFatalError(response, 'Internal error: Insert Failed. ' + err);
            database.close();
            return;
          }
          database.close();
        });
        
      }
      
      // Format the reply.
      var r = {"original_url": request.params.URL,
              "short_url": reply.short_url};
      response.send(JSON.stringify(r));
    });

  });
  
});


//////////////////////////////////////////////////////////////////////
// Handle the redirect
// Reference: 
// https://stackoverflow.com/questions/11355366/how-to-redirect-users-browser-url-to-a-different-page-in-nodejs
//////////////////////////////////////////////////////////////////////
app.get("/r/:KEY", function (request, response) {

  MongoClient.connect(mongoDbUrl, function (err, database) {

    if (err) {
      reportFatalError(response, 'Internal error: unable to connect to the mongoDB server. ' + err);
      return;
    }
    
    // The API Changed between Mongo 2.x and 3.x.
    // Reference: https://stackoverflow.com/questions/43779323/typeerror-db-collection-is-not-a-function
    var db = database.db("fccprojects");

    // do some work here with the collection we are using for this project.
    var collection = db.collection("url-shortener");

      // Did we already shorten this URL? 
    collection.find({"key": parseInt(request.params.KEY)}).toArray( function (err, documents) {
      
      if (err) {
        reportFatalError(response, 'Internal error: Failed Mongo find. ' + err);
        database.close();
        return;
      }
    
      // Valid shortened URL, redirect.
      if (documents.length > 0) {
        database.close();
        response.writeHead(301, {Location: documents[0].original_url});
        response.end();
      }
      // This is an invalid shortended URL.
      else {
        response.send(JSON.stringify({"error": "Unknown shortened URL: " + request.params.KEY }));
        database.close();
      }      
    });
  });
});


// listen for requests :)
var listener = app.listen(process.env.PORT, function () {
  console.log('Your app is listening on port ' + listener.address().port);
});
