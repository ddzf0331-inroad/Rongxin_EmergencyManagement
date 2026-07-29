# EPA SLAB notice

The adapter targets the U.S. EPA SLAB model distributed from:
https://gaftp.epa.gov/Air/aqmg/SCRAM/models/nonepa/slab/slab.zip

The upstream `SLAB.FOR` notice permits copying and distribution without a fee,
but states that SLAB may not be distributed as part of a commercial product.
Do not include the upstream source or executable in a commercial release until
the deployment owner has completed a license review. The application reports a
clear `SlabUnavailable` failure when a platform binary has not been installed.

Install the reviewed platform executable as `slab` (macOS/Linux) or `slab.exe`
(Windows) in this directory, or set the `SLAB_BINARY` environment variable.

