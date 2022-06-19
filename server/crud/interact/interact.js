const crud_user_basic = require('../user/basic');
const crud_connection = require('../user/connection');
const proximity = require('./proximity');
const crud_attack = require('./attack');
const config = require("../../config");

module.exports = {
    announce,
    attack_nearby
}

function maybe_send_message(user1, user2, distance, check_behind, io, message) {
    // send a message if they can hear/see it
    var distance_ok = proximity.within_distance(
        user1["lat"], user1["long"],
        user2["lat"], user2["long"], distance
    )

    if(!distance_ok) {
        // too far away to hear/see the message
        return;
    }
    
    var user_vectors = proximity.get_user_vectors(
        user2["lat"], user2["long"], user2["angle"],
        user1["lat"], user1["long"]
    )

    var user_angle = user_vectors[0].angle(user_vectors[1]) % Math.PI;

    if(check_behind && user_angle > config.FIELD_OF_VIEW) {
        // out of field of view so they cannot see it
        return;
    }

    // TODO: if the other player is faceing towards you or away from you
    // their left and right are switched ("the player in front of you walked left vs right"
    // changes depending on which way that player is facing)
    var direction_vector = user_vectors[0].cross(user_vectors[1]);
    // TODO: replace this vector library / do the math with only Math utils
    var cross_product_values = direction_vector.toString();
    var is_left =  cross_product_values[2] < 0;
    var direction_str = is_left? 'left': 'right';
    var perspective;
    if ( user_angle < Math.PI/10 ) {
        perspective = 'in front of you';
    } else if ( user_angle < Math.PI/4 ) {
        perspective = 'to the ' + direction_str + ' of you';
    } else if ( user_angle < config.FIELD_OF_VIEW/2 ) {
        perspective = 'to the far ' + direction_str + ' of you';
    } else if ( user_angle < (3*Math.PI)/4 ) {
        perspective = 'behind you to the ' + direction_str;
    } else {
        perspective = 'behind you'
    }

    io.to(user2["socket_id"]).emit('message', {
        // TODO: 'You *hear/see* the player to your left etc etc'
        // instead of just 'the player to your left etc etc
        data: 'The player ' + perspective + ' ' + message
    });
}

function announce(socket_id, io, message, distance, check_behind) {
    // get sockets of the close players
    crud_user_basic.get_user(socket_id).catch(console.dir).then( (user) => {
        crud_connection.get_other_connections(
            socket_id, user["lat"], user["long"], config.ONE_METER*distance
        ).catch(console.dir).then( (other_users) => {
            // send the message to the socket of each close player
            other_users.forEach( (other_user) => {
                maybe_send_message(user, other_user, config.ONE_METER*distance, check_behind, io, message);
            });
        });
    });
}

function attack_nearby(socket, io, distance, energy, damage, only_in_field_of_view) {
    // TODO: generalize for attacks other than punching
    // TODO: filter out players that are logged off / idle for a long time
    // get sockets of the close players
    crud_user_basic.get_user(socket.id).catch(console.dir).then( (user) => {

        if(user['energy'] < energy) {
            socket.send({data: "You don't have enough energy to punch! Sit or lay down to reset"});
            return;
        }

        crud_connection.get_other_connections(
            socket.id, user["lat"], user["long"], config.ONE_METER*distance
        ).catch(console.dir).then( (other_users) => {
            // send the message to the socket of each close player
            var punched = false
            return other_users.forEach( (other_user) => {
                if(proximity.is_close(user, other_user, config.ONE_METER*distance, only_in_field_of_view)) {
                    crud_attack.perform_attack(socket, io, user, other_user, damage, energy);
                    punched = true;
                    return;
                }
            }).then( () => {
                if(!punched) {
                    announce(socket.id, io, 'punched thin air', config.SEEING_DISTANCE, false);
                    socket.send({data: 'You missed'});
                    return;
                }
            });
        });
    });
}
