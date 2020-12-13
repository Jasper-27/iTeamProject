## Tests comparing sockets.io vs plain http

#### Socket.io
- With 20 clients connected:
- Server used 33.4 MB memory
- 0% CPU usage most of the time, CPU only used when client connecting or message sending

#### Http
- With 20 clients connected:
- 285MB memory
- Memory use climbed even when no new messages / clients were being added
- Between 2.5 and 3.5% CPU usage even when no new messages / clients being added

Socket.io is the clear winner
