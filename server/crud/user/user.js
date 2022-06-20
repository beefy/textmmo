const db = require('../db/db').get_db();
const crud_look_around = require('../interact/look_around');

module.exports = {
    create_user,
    create_admin,
    get_other_user,
    is_admin,
    respawn
};

const ages = ["young", "middle aged", "old"];
const heights = ["short", "average", "tall"];
const weights = ["skinny", "average", "fat"];

function getRandom(array) {
    return array[Math.floor(Math.random() * array.length)];
}

async function is_admin(socket_id) {
    return await db.collection('user').findOne({
        socket_id: socket_id
    }, {admin: 1});
}

async function get_other_user(email) {
    return await db.collection('user').findOne({
        email: email
    }, {lat: 1, long: 1, height: 1});
}

async function create_user(email, socket, io) {
    var angle = Math.random() * Math.PI * 2;
    await get_spawn_location().catch(console.dir).then( (spawn) => {
        db.collection('user').insertOne({
            email: email,
            lat: spawn["lat"], long: spawn["long"], height: spawn["height"],
            angle: angle,
            socket_id:socket.id,
            age: getRandom(ages), tall: getRandom(heights), weight: getRandom(weights), 
            posture: "standing",
            energy: 1,
            health: 1,
            last_cmd_ts: new Date(),
            last_set_posture_ts: new Date(),
            last_read_patch_notes: new Date(),
            admin: false
        }).catch( (error) => {
            if(err.name === 'MongoError' && err.code === 11000) {
                // duplicate email / returning user
                socket.send({data: "Welcome back!"});
            } else {
                console.error(error);
            }
        }).then( () => {
            crud_look_around.look_around(socket.id, io, angle, spawn["lat"], spawn["long"]);
        });
    })
}

async function respawn(socket_id, io, reason_of_death) {
    io.to(socket_id).emit('message', {
        data: 'You died from ' + reason_of_death + '. You are respawning'
    });
    var angle = Math.random() * Math.PI * 2
    await get_spawn_location().catch(console.dir).then( (spawn) => {
        db.collection('user').updateOne({
            socket_id: socket_id
        }, {
            $set: {
                lat: spawn["lat"], long: spawn["long"], height: spawn["height"],
                energy: 1,
                health: 1,
                last_cmd_ts: new Date(),
                posture: "standing",
                age: getRandom(ages), tall: getRandom(heights), weight: getRandom(weights),
                angle: angle
            }
        }).catch(console.dir).then( () => {
            crud_look_around.look_around(socket_id, io, angle, spawn["lat"], spawn["long"]);
        });
    });
}

async function create_admin(custom_db, email) {
    await custom_db.collection('user').updateOne({
        email: email
    }, {
        $set: {admin: true}
    });
}

async function get_spawn_location() {
    return await db.collection('world').find(
        {
            biome: "forest"
        }, {lat: 1, long: 1, height: 1, biome: 1}
    ).limit(1).skip(Math.round(Math.random()*50)).next();
}