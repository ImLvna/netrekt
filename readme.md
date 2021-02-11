# Netrekt
This is my attempt at bypassing netref.

For now, I will be testing these methods in Cloudready Home Edition, running inside of VmWare

## Methods:
### Timezone Change
#### Status: testing
For me, netref is set to only transmit between 7am and 4pm. On chromebooks, you should be able to change your timezone to sometime after 4pm.
### Url Blocker
#### Status: not started
It may be possible to add another extension to the chromebook from a non-managed account that will block all requests to netref's API
### Killer
#### Status: not started
Execute a script in crosh from a non-managed account that kills the netref service
### Remover
#### Status: not started
Execute a script from crosh that forcibly removes the netref extension
### Location spoofing
#### Status: researching
For me, netref will not send data if they are "outside the school". In their API, there is a return value which contains a sort of encoded IP. I'm guessing that they check if the IP matches the school. We could bypass this by using a vpn