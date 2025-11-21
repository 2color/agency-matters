---
title: "Homelab in 2025: self hosting your own cloud"
description:
tags:
  - homelab
  - self hosting
  - server
---

As part of the a recent digital housekeeping, I decided to audit my backup strategy and come up with a better strategy and use the opportunity to also expand my knowledge and expertise. This post goes into

For the last 10 years ago, I had a patchwork of different approaches:

- A Synology DS216 Play NAS with two hard drive RAID array using Synology Hybrid RAID.
- I had my most important documents synced to my icloud drive and I would ocasionally snapshot this folder —which wasn't that big— using a tarball file and save a copy on the NAS.

## Replacing an aging Synology NAS

The Synology NAS is practically a little Linux with SSH access. It has served me well, thanks to its user friendly web interface and built-in package manager. I installed Plex and could access my media library via the browser and the Plex app on an Amazon Fire TV.

However, throughput was often subpar, in large part due to [[SMB]] encryption causing the CPU to max out during file transfers, which once disabled, improved significantly. Moreover, I wanted to be able to deploy containers, which isn't possible due to it's older CPU architecture and meagre resources. I also started getting SMART warnings about the health of one of the hard drives.

So I decided to set up a new homelab server that would replace the Synology NAS.

## What's a homelab

For the uninitiated, homelab just means a computer that's running 24/7, typically without a screen, with the purpose of providing services, hence the name server, which can include backups, NAS, media server, etc. It's like a self-hosted cloud.

Homelabs are not a new idea and there are many thriving communities and resources, e.g. [`/r/homelab`](https://www.reddit.com/r/homelab/) and [Perfect Media Server](https://perfectmediaserver.com/).

My journey into homelabs started in the early 2000s when I ran a server at home that would primarily serve as a static file server and web based mail server, back when USB sticks were rare and prohibitively expensive, Gmail didn't exist, and the ISP would limit your mailbox to 5MB.

Back then, I ran a Linux distribution called [SME Server](https://en.wikipedia.org/wiki/Koozali_SME_Server) which came with a Web UI through which you could configure the different services. The initial purpose of the server was to provide my family with a webmail client that could be accessed from anywhere. Since the ISP only supported POP3, the server would download the emails and provide access to the mailboxes with IMAP and [Horde](<https://en.wikipedia.org/wiki/Horde_(software)>). I learned the Linux terminal and many admin skills that have served me well over the years.

Unlike 20 years ago, these days, there's a massive industry of cloud services with competative pricing and generous free tiers. So why bother running hardware after all? For me this can be boiled down to three motivations:

- Agency: control over my experience.
- Resilience: the ability with withstand outages and service dispruptions to cloud services.
- Self-reliance: knowing that I can serve my own digital needs while learning and deepening my knowledge and expertise.

## Hardware for a homelab

My criteria for picking hardware were:

- Size: I needed something small
- Extensibility: I wanted the ability to add RAM, and replace SSDs in case of failure
- Price: I didn't want to spend too much
- Power: I actually didn't care too much about power consumption, since I'm only running a single server.

In recent years, the market has been flooded with Chinese brands such as Beelink who produce excellent Mini PCs, though they aren't very extensible. In the lower price ranges (~150 USD), many come with the Intel N150, which while very power efficient, wasn't as performant as slightly older mini PCs at the same price.

I eventually opted for the HP EliteDesk 800 G4 Mini, which I snatched for 150 Euros refurbished with a 2 year warrenty. It comes with the Intel 8th gen Core i5-8500 from 2018 and scores almost double the performance of the Intel N150 at up to 10 times the power consumption ([see comparison](https://www.cpubenchmark.net/compare/6304vs3223/Intel-N150-vs-Intel-i5-8500)).

The main reason though was hardware extensibility: Two memoery slots, two internal NVMe M.2 slots. It also sports Intel vPro with Active Management Technology (AMT) which allows for headless remote control without physical keyboard/screen access. This meant I could install Ubuntu Server and control the BIOS remotely, using the open source [MeshCommander](https://www.meshcommander.com/).

One thing I learned while setting it up is that for remote control to work without a physical screen, I needed a dummy DisplayPort emulator. This tiny little plug that looks like a flash drive and helps prevent issues like a blank screen when trying to connect to a computer remotely.

I ended up also extending the memory to 16GB of DDR4 RAM, and adding an second 1TB WD BLACK SN770 NVMe SSD. For more durable and redundant storage I got two Seagate IronWolf 6TB HDs. After extensive research, I came to the conclusion that the best way to attach these disks is using a USB 3.2 Gen2 DAS which supports up to 10Gpbs. There aren't many such DAS on the market, but the [TERRAMASTER D4-320](https://www.youtube.com/watch?v=ZdEqEWiA2CE) is one of those and sports 4 bays, in case I want to add more disks in the future. The main benefit this DAS offers is a way to externally connect more drives, also referred to as JBOD (Just a Bunch of Disks), that appear to the operating system as separate disks:

```bash title="$ sudo fdisk -l"

Disk /dev/sda: 5.46 TiB, 6001175126016 bytes, 11721045168 sectors
Disk model: TDAS
Units: sectors of 1 * 512 = 512 bytes
Sector size (logical/physical): 512 bytes / 4096 bytes
I/O size (minimum/optimal): 4096 bytes / 4096 bytes
Disklabel type: gpt
Disk identifier: FA7FD1EB-E867-B349-864E-8C0FE22A1312

Device           Start         End     Sectors  Size Type
/dev/sda1         2048 11721027583 11721025536  5.5T Solaris /usr & Apple ZFS
/dev/sda9  11721027584 11721043967       16384    8M Solaris reserved 1


Disk /dev/sdb: 5.46 TiB, 6001175126016 bytes, 11721045168 sectors
Disk model: TDAS
Units: sectors of 1 * 512 = 512 bytes
Sector size (logical/physical): 512 bytes / 4096 bytes
I/O size (minimum/optimal): 4096 bytes / 4096 bytes
Disklabel type: gpt
Disk identifier: DCB45D5F-1999-214F-B27F-08706E7066B8

Device           Start         End     Sectors  Size Type
/dev/sdb1         2048 11721027583 11721025536  5.5T Solaris /usr & Apple ZFS
/dev/sdb9  11721027584 11721043967       16384    8M Solaris reserved 1
```

Note that it was important for me to avoid hardware RAID at all costs, because it creates a dependency on the specific hardware to manage the RAID which poses data loss risk if the hardware malfunctions and you cannot find an identical replacement. With the [[ZFS]] filesystem, I set up a software RAID array using the two disks, and know that if I change the hardware, I can just import the the storage pool.

When setting up the ZFS pool, I set up two disk mirror vdev (similar to RAID1) rather than a more complex RAIDZ array with parity vdevs (like RAID5). For more information see [[ZFS#Why Mirror VDEVs Over RAIDZ]].

## Reproduciblity with Ansible

Snowflake servers are servers that have been manually configured such that they are difficult if not impossible to reproduce. This is typically a problem if you want to replace the hardware and reproduce the exact same setup.

After setting up, deploying, and operating many servers over the years in both professional and personal capacity, I've learned that so called snowflake servers are bad, or as [Martin Fowler once put it](https://martinfowler.com/bliki/SnowflakeServer.html):

> The result is a unique snowflake - good for a ski resort, bad for a data center.

When setting up the homelab server, I avoided this by using a server configuration management tool called Ansible.

Ansible is a modern configuration management tool that facilitates the task of setting up and maintaining remote servers, with a minimalist design intended to get users up and running quickly.

With Ansible, you write Roles comprised of individual tasks which are called from a Playbook; by rough analogy, a Role is like a class where a Playbook is an object. Each role can be responsible for a specific goal, e.g. installing Promethues, setting up a ZFS storage pool, or deploying a container. It also comes with a templating system which can be used for templating configuration files and service definitions. This is especially useful for making Roles reusable and shareable.

Where Ansible stands out is that it doesn't require any special daemon or agent installed on the target machine. You just need SSH access and for Python to be installed. Moreover, Ansible encourage idempotence, meaning that you can run the same playbook or task multiple times, and after the first run, subsequent runs won't make any changes if the system is already in the desired state. So you can safely re-run playbooks without worrying about breaking things.

What I like the most about Ansible is how easy it is to get up and running without a huge investment in learning every aspect of it. Another thing I like about Ansible is that it serves as a form of documentation for the intended end-state of a server, which is especially useful when learning and mastering new tools or packages. For example, in the ZFS role I created to create the mirror storage pool, I documented many ZFS properties, e.g. hash function, in great length in the default variables file thereby enhancing reusability for other use cases.

Most of what I'm running on the server is Docker containers, which makes it really easy to manage with the [`community.docker.docker_container`](https://docs.ansible.com/projects/ansible/latest/collections/community/docker/docker_container_module.html). In essence, my roles for Docker containers encapsulate the docker image, along with port mappings, network configuration, volume mounts, with a lot of the configration interpolated from variables, ensuring flexibility and reusablility.

## Monitoring and alerting

To monitor the server I initially installed [Cockpit](https://cockpit-project.org/) to have a web interface to get a high-level of the health of the server. I then installed Portainer to get an overview of the state of the Docker containers.

But I deployed more services, I decided to add Prometheus, which I've used on and off for almost ten years in professional capacity, and continues to be one of the leading metrics monitoring systems with a lively ecosystem ef exporters and instrumentation libraries.

The way I set Prometheus up is as a Docker container, along with [cAdvisor](https://github.com/google/cadvisor) and [node-exporter](https://github.com/prometheus/node_exporter) which export resource and performance metrics of the operating system and the Docker containers. I have a scrape interval of 15s and the jobs are configured using an Ansible template.

One way to think about Prometheus is as a time series database, which pulls metrics from different services/exporters. The way pulling typically works is extremely simple: an HTTP request to a metrics expoint, which is standardised on now . This simple design has many benefits: the pull based approach gives you automatic insight into the liveness of services.

I then set up alerts for high CPU and memory usage, low disk space, and container down. These are procssed by Prometheus which when triggered sends the alerts to an a separate component called Alertmanager which manages those alerts, including silencing, inhibition, aggregation and sending out notifications via methods. In my case, I set up email notifications and called it a day.

To visualise the metrics, I then deployed a Grafana container with Prometheus configured as a data source to visualise the metrics. For [node exporter](https://grafana.com/grafana/dashboards/1860-node-exporter-full/) and cadvisor I took public dashboards from Grafana to avoid reinventing the wheel and then templated them into the Grafana role so they are statically provisioned with the container. This ensures reproducibility and dodges the snowflake problem.

I was pretty surprised by how little my resource utilisation was. The CPU sits at under 10% most time

## The danger of running public servers

So how do I make my homelab accessible from everywhere?

[The Dark Forest Theory of the Internet](https://www.ystrickler.com/the-dark-forest-theory-of-the-internet/) postulates that internet culture has retreted into private and semi-private spaces where people feel safer on a cultural level, as a result of the internet becoming more predetory and dangerous.

> Imagine a dark forest at night. It’s deathly quiet. Nothing moves. Nothing stirs. This could lead one to assume that the forest is devoid of life. But of course it’s not. The dark forest is full of life. It’s quiet, because night is when the predators come out. To survive, the animals stay quiet. ~ Yancey Strickler

This idea runs through the many layers of the internet, starting from infrastructure all the way to the cultural. The reality is that if you run a server with a public IP that merely runs an HTTP server, you are likely to get hammered with requests from bots — malicious traffic intended to find and take advantage of security flaws and exploits.

In the past, I would have set up something like dynamic DNS: a persistent DNS name gets updated automatically everytime the IP changes. There are many free services for this, e.g. [DuckDNS](https://www.duckdns.org/).

With a persistent and memorable DNS name, I would forward ports so that my homelab server is reachable publicly even though it's behind NAT.

There are many problems with this approach: you need to set up a TLS certificate (which addmitedly is easy with Caddy), and then probably another authentication layer. With multiple services, each with its own auth layer, the surface for potential exploits just grows.

This is where Tailscale comes in with a slick and secure solution.

## Tailscale: peer-to-peer mesh VPN

I was kind of aware of Tailscale as a way to have all your devices connected, but never really tried it until I read the blog post [How I use Tailscale](https://chameth.com/how-i-use-tailscale/) which was trending a couple of months ago on Hacker News, and really made the case for it.

Tailscale creates a mesh network between all your devices using WireGuard and importantly establishes peer-to-peer connections where possible.

I can just type `homelab-1` in my phone browser and access my homelab dashboard. I can also just ssh into `homelab-1` in the terminal and connect directly.

No port forwarding, no worrying about unauthorised access. Just pure bliss of direct secure connectivity. For authentication into Tailscale, I have my Google account and a passkey configured, that way if Google goes down —though if it does I think I might have bigger problems— I can still login.

One thing I still have want to spend more time building out is exposing services to friends and wider circles in "cosy-web" fashion: perhaps using short-lived magiclinks/ticket/tokens —similar to the ones in [iroh](https://www.iroh.computer/docs/concepts/tickets)— that I can pass around in links, avoiding any required registration.

Disclaimer: I am not paid or sponsored by Tailscale (though I'm open to it if someone from Tailscale reads this 😊) I just think they built a fanstastic product that complements the wonderful open-source WireGuard with a generous free tier.

## The fun part: self-hosting and deploying stuff

All of this was a long prelude to the fun stuff: I can now easily deploy software and service for my own use. It's as if I have my own cloud that is only accessible to me. My cosy corner in the dark forest.

So far I am self hosting:

- [Jellyfin](https://jellyfin.org/) - Free and open-source media server
- [ytdl-sub](https://github.com/jmbannon/ytdl-sub) - YouTube downloader with YAML-based config
- [Samba](https://wiki.samba.org/index.php/Main_Page) - File sharing server
- [Remark42](https://remark42.com/) - Self-hosted commenting system

My plan is to also run or at least test some of these:

- [Plausible Analytics](https://plausible.io/) - Privacy-friendly web analytics
- [linkding](https://github.com/sissbruecker/linkding) - Self-hosted bookmark manager
- [Miniflux](https://miniflux.app/) - Minimalist RSS reader
- [CodiMD](https://github.com/hackmdio/codimd) - Collaborative markdown editor
- [Radicle Seeder](https://radicle.xyz/guides/seeder) - Radicle seed node
- [Coolify](https://coolify.io/docs/get-started/introduction) - Self-hosted Heroku/Netlify alternative

## Vibecoding infra

AI and LLMs have been very helpful for this project — for research, hardware comparisons, landscape tooling research, and for Ansible role writing, reviewing, and debugging. I was able to just gollop down larger swaths of information, iterate faster, and make better decisions.

My general approach has been to brutally refine and iterate on design documents, making sure to be active in the loop and keep designs from getting unnecessrily obtuse. I created a Claude Subagent to help with reviews using the following prompt:

> You are a senior software engineer and infrastructure expert with extensive experience as an SRE (Site Reliability Engineer) and technical lead. You have spent years reviewing code, mentoring engineers, and leading complex technical projects across diverse technology stacks. Your expertise spans software architecture, infrastructure design, security, performance optimization, and operational excellence.

My general rule of thumb is to only commit/run code that I understand, though I am sometimes willing to be flexible on this, but I find this to guiding principle to encourage learning and growth. It also avoids these tedious loops trying to fix a big mess created with a one-shot prompt having too large a scope.

## Final words

Setting up this homelab server has reinvigurated my sense of agency. I will soon share the repository with all the Ansible roles so others can use it.