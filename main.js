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
    let flights = getFlights(json, req.query.availability)
    res.send(flights)
  }).catch(reason => res.send(reason))
})


function getFlights (json, availability) {
  let quotes = json["Quotes"]
  let places = createDictBy(json["Places"], "PlaceId")
  let flights = []

  quotes = _.sortBy(quotes, 'MinPrice')
  quotes = _.filter(quotes, (quote) => {
    return quoteInAvailability(quote, availability)
  })

  for (let i = 0; (i < MAX_RECOMMENDATIONS) && (i < quotes.length); ++i) {
    let quote = quotes[i]
    let outbound = quote["OutboundLeg"]
    let inbound = quote["InboundLeg"]
    let origin = places[outbound["OriginId"]]["Name"]
    let destination = places[outbound["DestinationId"]]["Name"]
    let price = quote["MinPrice"]
    flights.push({
      origin: origin,
      destination: destination,
      price: price,
      outboundDate: outbound["DepartureDate"],
      inboundDate: inbound["DepartureDate"],
      imgUrl: "https://www.amda.edu/media/ny.jpg"
    })
  }

  return flights
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
    headers: {
      'User-Agent': 'Request-Promise'
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