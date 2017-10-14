let express = require('express')
let _ = require('underscore')
let rp = require('request-promise-native')
let env = require('dotenv')
let app = express()

let port = process.env.port || process.env.PORT || 3000;

app.listen(port, () => {
  console.log(`Server online on port ${port}`)
})

env.load()

const MAX_RECOMMENDATIONS = 3

app.get('/countries', function (req, res) {
  // locale, origin, availability
  let getPromise = getRequestCountries(req.query.locale, req.query.origin)
  getPromise.then(json => {
    let countries = getCountries(json, req.query.availability)
    res.send(countries)
  }).catch(reason => res.send(reason))
})

app.get('/flights', function (req, res) {
  let getPromise = getRequestFlights(req.query.locale, req.query.origin, req.query.destination)
  getPromise.then(json => {
    let obj = getFlights(json, req.query.availability)
    for (let i = 0; i < obj.promises.length; ++i) {
      let promise = obj.promises[i]
      promise.then(json => {
        obj.flights[i].imgUrl = generateImgUrl(json)
      })
    }
    Promise.all(obj.promises)
      .then(() => res.send(obj.flights))
      .catch(msg => console.log(msg))
  }).catch(reason => res.send(reason))
})


function getFlights (json, availability) {
  let quotes = json["Quotes"]
  let places = createDictBy(json["Places"], "PlaceId")
  let flights = []
  let promises = []

  quotes = _.sortBy(quotes, 'MinPrice')
  quotes = _.filter(quotes, (quote) => {
    return quoteInAvailability(quote, availability)
  })

  for (let i = 0; i < MAX_RECOMMENDATIONS; ++i) {
    let quote = quotes[i]
    let outbound = quote["OutboundLeg"]
    let inbound = quote["InboundLeg"]
    let origin = places[outbound["OriginId"]]["Name"]
    let destination = places[outbound["DestinationId"]]["Name"]
    flights.push({
      origin: origin,
      destination: destination,
      price: quote["MinPrice"],
      outboundDate: outbound["DepartureDate"],
      inboundDate: inbound["DepartureDate"],
      imgUrl: null
    })
    let promise = getImageFor(destination)
    promises.push(promise)
  }

  return { flights: flights, promises: promises }
}

function getCountries (json, availability) {
  let routes = json["Routes"]
  let quotes = createDictBy(json["Quotes"], "QuoteId")
  let places = createDictBy(json["Places"], "PlaceId")
  let countries = []

  routes = _.sortBy(routes, 'Price')
  routes = _.filter(routes, (route) => {
    let routeQuotes = _.map(route["QuoteIds"], function (id) { return quotes[id] })
    for (let i = 0; i < routeQuotes.length; ++i) {
      let quote = routeQuotes[i]
      if (quoteInAvailability(quote, availability)) return true
    }
    return false
  })

  for (let i = 0; i < MAX_RECOMMENDATIONS; ++i) {
    let route = routes[i]
    let destination = places[route["DestinationId"]]["Name"]
    let price = route["Price"]
    countries.push({
      destination: destination,
      price: price,
      imgUrl: "https://www.amda.edu/media/ny.jpg"
    })
  }

  return countries
}

function getRequestFlights(locale, origin, destination) {
  let options = {
    uri: 'http://partners.api.skyscanner.net/apiservices/browsequotes/v1.0/FR/eur/' + locale + '/' + origin + '/' + destination + '/anytime/anytime',
    qs: {
      apiKey: process.env.API_KEY // -> uri + '?access_token=xxxxx%20xxxxx'
    },
    json: true // Automatically parses the JSON string in the response
  };

  return rp(options)
}

function getRequestCountries(locale, origin) {
  let options = {
    uri: 'http://partners.api.skyscanner.net/apiservices/browseroutes/v1.0/FR/eur/' +locale + '/' + origin
    + '/anywhere/anytime/anytime',
    qs: {
      apiKey: process.env.API_KEY // -> uri + '?access_token=xxxxx%20xxxxx'
    },
    json: true // Automatically parses the JSON string in the response
  };

  return rp(options)
}

function quoteInAvailability (quote, availability) {
  let outbound = quote["OutboundLeg"]["DepartureDate"]
  let inbound = quote["InboundLeg"]["DepartureDate"]
  return checkAvailability(availability, new Date(outbound)) && checkAvailability(availability, new Date(inbound))
}

function checkAvailability (availability, date) {
  return (availability === "Anytime" || availability === "Weekend" && isWeekend(date) ||
  availability === "Weekdays" && !isWeekend(date))
}

function isWeekend (date) {
  let d = date.getDay()
  return (d === 0 || d === 6)
}

function createDictBy(obj, id) {
  let ret = {}

  obj.forEach(element => {
    let elemId = element[id]
    ret[elemId] = element
  })

  return ret
}

function getImageFor (city) {
  let options = {
    uri: 'https://api.flickr.com/services/rest/?method=flickr.photos.search&api_key=8d1b968d3b8075b564197385b9306e7a&tags=landscape%2C+' + city + '&tag_mode=all&format=json&nojsoncallback=1&auth_token=72157688006296333-6dd7f3835e03a207&api_sig=a6d051ac077ccc263fa19114aa3581f7',
    json: true // Automatically parses the JSON string in the response
  };

  return rp(options)
}

function generateImgUrl (json) {
  let photo = json["photos"]["photo"][0]
  let farm_id = photo["farm"]
  let server_id = photo["server"]
  let id = photo["id"]
  let secret = photo["secret"]

  return "https://farm" + farm_id + ".staticflickr.com/" + server_id + "/" + id + "_" + secret + ".jpg"
}