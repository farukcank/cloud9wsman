cloud9wsman
===========

Currently Cloud9 IDE https://github.com/ajaxorg/cloud9 open source component does not have any user or workspace management capabilities which makes IDE use cases very limmited.

Purpose of this project is to provide workspace and user management for Cloud9 IDE. 

## Installation ##

### Requirements

* redis >= 2.8.17
* NodeJS >= 0.10 
* NPM >= 1.3
* docker.io >= 1.2
* Ubuntu >= 14.0.4

Those requirements are my work environment. It might work on lower versions or other operating systems. But it is untested.

### Preperation
    sudo -s
    apt-get update
    apt-get install build-essential

### Redis
    apt-get install redis-server

### Docker IO
    apt-get install docker.io
    ln -sf /usr/bin/docker.io /usr/local/bin/docker
    sed -i '$acomplete -F _docker docker' /etc/bash_completion.d/docker.io
    docker pull fcank/cloud9:v1
This last step will download the cloud9 image I have prepared.

### node.js and npm
    apt-get install nodejs
    apt-get install npm
    ln -sf /usr/bin/nodejs /usr/local/bin/node
    
### cloud9wsman
    git clone https://github.com/farukcank/cloud9wsman.git
    cd cloud9wsman
    npm install
    node index.js
    
## First run
You can login with username 'admin' and password 'admin'. It is strongly recommended that you change this password immediateliy.
Create a workspace in manage pages, run it, then click its name to launch the cloud9 IDE.
