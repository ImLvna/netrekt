# Netrekt
This is my attempt at bypassing netref.

For now, I will be testing these methods in Cloudready Home Edition, running inside of VmWare

## Methods:
### Timezone Change
#### Status: testing
For me, netref is set to only transmit between 7am and 4pm. On chromebooks, you should be able to change your timezone to sometime after 4pm.

### Url Blocker
#### Status: researching
It may be possible to add another extension to the chromebook from a non-managed account that will block all requests to netref's API
### Killer
#### Status: researching
Execute a script in crosh from a non-managed account that kills the netref service
### Remover
#### Status: researching
Execute a script from crosh that forcibly removes the netref extension