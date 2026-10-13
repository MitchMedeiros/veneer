# a config
job "web" {
  datacenters = ["dc1"]
  type        = "service"

  group "app" {
    count = 3

    task "server" {
      driver = "docker"

      config {
        image = "nginx:1.25"
        ports = ["http"]
      }

      resources {
        cpu    = 500
        memory = 256
      }
    }
  }
}

// line comment
locals {
  enabled = true
  names   = [for n in ["a", "b"] : upper(n)]
}
