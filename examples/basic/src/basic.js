// Last generated on $$DATE()

process.env.NODE_ENV = 'debug';

@DEBUG("Enter basic sample...");

var user = process.env.USER;

@LOG_EXISTS(user);

@DEBUG("Exit basic sample...");

@FOR(10, 'if (i %2) {mod++;}');
