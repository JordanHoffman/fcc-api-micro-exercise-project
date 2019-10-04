/*
Takeaways:
- The Not found middleware should always be at the end of the middlewares since they're executed in order. Otherwise it will prevent middlewares from being found that would normally be found!

- If searching for an id via mongoose, and you put in an id that's not found, it will throw a cast error. Nothing is necessarily wrong though, it may just not have been found.

ex)
CastError: Cast to ObjectId failed for value "5d8e42a3e36501dc54050f7" at path "_id" for model "User"

- .then() and .exec() work differently. I need to understand these more. I just use .then() though. It works fine.
*/

const express = require('express')
const app = express()
const bodyParser = require('body-parser')

const cors = require('cors')

const mongoose = require('mongoose')
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology:true }).catch(error => {console.log("Error connecting mongoose to database: " + error)});

app.use(cors())

app.use(bodyParser.urlencoded({extended: false}))
app.use(bodyParser.json())


app.use(express.static('public'))
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/views/index.html')
});

//I guess everything starts here
var Schema = mongoose.Schema

var userSchema = new Schema({
  userName: {
    type: String,
    required: true
  }
}, {collection: "users"})

var exerciseSchema = new Schema({
  userId:{
    type: String,
    required: true
  },
  description:{
    type: String,
    required: true
  },
  duration:{
    type: Number,
    required: true
  },
  date:{
    type: Date
  }
} , {collection: "exercises"})

let User = mongoose.model('User', userSchema)
let Exercise = mongoose.model('Exercise', exerciseSchema)

//Get for getting list of all users
app.get("/api/exercise/users", (req, res)=>{
  User.find({},'userName _id').then(function(array){
    if(array.length){
      console.log("users found!")
      res.send(array)
    }
    else {
      console.log("no users found, somethings wrong")
    }
  })
})

//Get for getting all exercises for a user
app.get("/api/exercise/log", (req, res)=>{
  let userId = req.query.userId
  let from = req.query.from
  let to = req.query.to
  let limit = req.query.limit
  
  User.findById(userId, function(err, doc)
  {
    //Be aware that an error may just mean that the user wasn't found
    if (err) console.log("Error locating user: " + err)
    
    if (doc)
    {
      //Initially prepare the json response as if no exercises were found
      let jsonResponse = {_id: userId, username: doc.userName, count: 0, log:[]}
      
      //Now check optional parameters. Check if from, to, and limit are in proper format. To must be greater than from. Limit must be greater than 0.
      
      //from
      if (from)
      {
        //First test if its format is yyyy-mm-dd, then test if it's actually a valid date
        var regEx = /^\d{4}-\d{2}-\d{2}$/
        if(!from.match(regEx)) res.send("Your \"from\" parameter needs the format: yyyy-mm-dd with numbers for year, month, and day.")
        else if (isNaN(Date.parse(from))) res.send("Invalid \"from\" parameter provided (not a real date)")
      }
      
      //to
      if (to)
      {
        //First test if its format is yyyy-mm-dd, then test if it's actually a valid date
        var regEx = /^\d{4}-\d{2}-\d{2}$/
        if(!to.match(regEx)) res.send("Your \"to\" parameter needs the format: yyyy-mm-dd with numbers for year, month, and day.")
        else if (isNaN(Date.parse(to))) res.send("Invalid \"to\" parameter provided (not a real date)")
      }
      
      //Check if from is greater than to
      if (from && to && (Date.parse(from) >= Date.parse(to))) res.send("Your \"from\" parameter must be less than your \"to\" parameter")
      
      //limit
      if (limit){
        if (isNaN(limit)) res.send("Your \"limit\" parameter must be a number")
        else limit = parseInt(limit)
        if (limit <= 0) res.send("Your \"limit\" parameter must be greater than 0")
      }
        
      //At this point, all optional parameters have been checked. If they still have truthy values, then it means they're validated and should be used.
      let queryObject = Exercise.find({userId: userId})
      if (from) queryObject.where("date").gte(from)
      if (to) queryObject.where("date").lte(to)
      if (limit) queryObject.limit(limit)
      queryObject.sort('-date')
      
      queryObject.then(function(array)
      {
        //Update the response if exercises are found
        if (array)
        {
          jsonResponse.count = array.length
          array.forEach(function(doc){
            let docObject = {description: doc.description, duration: doc.duration, date: doc.date.toString().slice(0,15)}
            jsonResponse.log.push(docObject)
          })
        }
        res.json(jsonResponse)
      })
    }
    //The id wasn't found or perhaps the query parameter was spelled wrong
    else {
      res.send("No user found for the given id.")
    }
  })
})

//Post for creating a new user
app.post("/api/exercise/new-user", (req, res)=>{
  let username = req.body.username
  
  if (username.length == 0) res.send("Username cannot be blank")
  
  var checkName = User.findOne({userName : username})
  //Check if name taken    
  checkName.then(function(doc)
  {
    //Username already Taken
    if (doc){
      res.send("Username is taken")
    }
    //Username available
    else 
    {
      let newUser = new User({userName: username})
      newUser.save(function(err, doc) {
        if (err) console.log("Error creating user: " + err)
        else res.json({"userName": doc.userName, "_id":doc._id})
      })
    }
  })
}) //end of new user post

//Post for creating a new exercise
app.post("/api/exercise/add", (req, res)=>{
  let userId = req.body.userId
  let desc = req.body.description
  let duration = req.body.duration
  let date = req.body.date
  
  if (!userId.length) res.send("You must include a userId")
  else User.findOne({_id: userId}).then(function(doc)
  {
    //The userId was found, continue with rest of validation
    if (doc)
    {
      //Hold on to the user doc info for saving res.json part later
      let userDoc = doc;
      //Perform all validation of fields
      if (!desc.length) res.send("You must include a description")
      if (!duration.length) res.send("You must include a duration")
      else if (isNaN(duration)) res.send("Cannot cast duration: \"" + duration + "\" to number.")
      if (date.length)
      {
        //First test if its format is yyyy-mm-dd, then test if it's actually a valid date
        var regEx = /^\d{4}-\d{2}-\d{2}$/
        if(!date.match(regEx)) res.send("Your date needs the format: yyyy-mm-dd with numbers for year, month, and day.")
        else if (isNaN(Date.parse(date))) res.send("Invalid date provided")
      }
      //No date provided so just use current date with format yyyy-mm-dd
      else date = new Date().toISOString().slice(0,10); 
      
      //All the validation is done. If we've reached this point, we can save
      let newExercise = new Exercise({userId: userId, description: desc, duration: duration, date: date});
      newExercise.save(function(err, doc) 
      {
        if (err) res.send("Error creating exercise: " + err)
        else res.json({userName: userDoc.userName, description: doc.description, duration: doc.duration, _id: userDoc._id, date: doc.date.toString().slice(0,15)})  
      })
    }
    //The userId was not found
    else res.send("The userId was not found")
  })
}) //end of add exercise post

// Not found middleware
app.use((req, res, next) => {
  return next({status: 404, message: 'not found, path: ' + req.path + " route: " + req.route})
})

// Error Handling middleware
app.use((err, req, res, next) => {
  let errCode, errMessage

  if (err.errors) {
    // mongoose validation error
    errCode = 400 // bad request
    const keys = Object.keys(err.errors)
    // report the first validation error
    errMessage = err.errors[keys[0]].message
  } else {
    // generic or custom error
    errCode = err.status || 500
    errMessage = err.message || 'Internal Server Error'
  }
  res.status(errCode).type('txt')
    .send(errMessage)
})

//Always at end I think
const listener = app.listen(process.env.PORT || 3000, () => {
  console.log('Your app is listening on port ' + listener.address().port)
})
