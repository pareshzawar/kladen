// GENERATED from OpenTofu registry docs — provider opentofu/oci v8.23.0.
// Source: https://search.opentofu.org/provider/opentofu/oci/latest (984 resources total;
// this catalog is the curated buildable subset — regenerate with frontend/scripts/gen_catalog.py).
// Required flags and descriptions come from the provider's Argument Reference.

export const PROVIDER_VERSION = "v8.23.0";

export interface CatalogParam {
  name: string; // HCL argument name
  required: boolean;
  desc: string; // what the provider is asking for
  example: string; // example value, HCL syntax
}

export interface CatalogService {
  key: string;
  name: string;
  glyph: string;
  rtype: string;
  summary: string;
  params: CatalogParam[]; // all required args first, then notable optional ones
  nOptionalMore: number; // further optional args documented in the provider
  used?: boolean;
}

export const catalogGroups: { name: string; items: CatalogService[] }[] = [
  {
    "name": "NETWORKING",
    "items": [
      {
        "key": "core_vcn",
        "name": "VCN",
        "glyph": "VC",
        "rtype": "oci_core_vcn",
        "summary": "Virtual Cloud Network \u2014 the private network boundary of a stack.",
        "params": [
          {
            "name": "compartment_id",
            "required": true,
            "desc": "The OCID of the compartment to contain the VCN.",
            "example": "var.compartment_ocid"
          },
          {
            "name": "cidr_blocks",
            "required": false,
            "desc": "The list of one or more IPv4 CIDR blocks for the VCN that meet the following criteria.",
            "example": "[\"10.0.0.0/16\"]"
          },
          {
            "name": "dns_label",
            "required": false,
            "desc": "A DNS label for the VCN, used in conjunction with the VNIC's hostname and subnet's DNS label to form a fully qualified domain name (FQDN) for each VNIC within this subnet (for example, `bminstance1.s\u2026",
            "example": "\"acmeprod\""
          },
          {
            "name": "is_ipv6enabled",
            "required": false,
            "desc": "Whether IPv6 is enabled for the VCN.",
            "example": "false"
          }
        ],
        "nOptionalMore": 8,
        "used": true
      },
      {
        "key": "core_subnet",
        "name": "Subnet",
        "glyph": "SN",
        "rtype": "oci_core_subnet",
        "summary": "IP range inside a VCN; public or private placement for resources.",
        "params": [
          {
            "name": "compartment_id",
            "required": true,
            "desc": "The OCID of the compartment to contain the subnet.",
            "example": "var.compartment_ocid"
          },
          {
            "name": "vcn_id",
            "required": true,
            "desc": "The OCID of the VCN to contain the subnet.",
            "example": "oci_core_vcn.main.id"
          },
          {
            "name": "cidr_block",
            "required": false,
            "desc": "The CIDR IP address range of the subnet.",
            "example": "\"10.0.1.0/24\""
          },
          {
            "name": "prohibit_public_ip_on_vnic",
            "required": false,
            "desc": "Whether VNICs within this subnet can have public IP addresses.",
            "example": "true"
          },
          {
            "name": "route_table_id",
            "required": false,
            "desc": "The OCID of the route table the subnet will use.",
            "example": "oci_core_route_table.private.id"
          },
          {
            "name": "dns_label",
            "required": false,
            "desc": "A DNS label for the subnet, used in conjunction with the VNIC's hostname and VCN's DNS label to form a fully qualified domain name (FQDN) for each VNIC within this subnet (for example, `bminstance1.s\u2026",
            "example": "\"acmeprod\""
          }
        ],
        "nOptionalMore": 10
      },
      {
        "key": "core_internet_gateway",
        "name": "Internet Gateway",
        "glyph": "IG",
        "rtype": "oci_core_internet_gateway",
        "summary": "Gives public subnets a route to and from the internet.",
        "params": [
          {
            "name": "compartment_id",
            "required": true,
            "desc": "The OCID of the compartment to contain the internet gateway.",
            "example": "var.compartment_ocid"
          },
          {
            "name": "vcn_id",
            "required": true,
            "desc": "The OCID of the VCN the Internet Gateway is attached to.",
            "example": "oci_core_vcn.main.id"
          },
          {
            "name": "enabled",
            "required": false,
            "desc": "Whether the gateway is enabled upon creation.",
            "example": "true"
          },
          {
            "name": "route_table_id",
            "required": false,
            "desc": "The OCID of the route table the Internet Gateway is using.",
            "example": "oci_core_route_table.private.id"
          }
        ],
        "nOptionalMore": 3
      },
      {
        "key": "core_nat_gateway",
        "name": "NAT Gateway",
        "glyph": "NG",
        "rtype": "oci_core_nat_gateway",
        "summary": "Outbound-only internet access for private subnets.",
        "params": [
          {
            "name": "compartment_id",
            "required": true,
            "desc": "The OCID of the compartment to contain the NAT gateway.",
            "example": "var.compartment_ocid"
          },
          {
            "name": "vcn_id",
            "required": true,
            "desc": "The OCID of the VCN the gateway belongs to.",
            "example": "oci_core_vcn.main.id"
          },
          {
            "name": "block_traffic",
            "required": false,
            "desc": "Whether the NAT gateway blocks traffic through it.",
            "example": "false"
          },
          {
            "name": "public_ip_id",
            "required": false,
            "desc": "The OCID of the public IP address associated with the NAT gateway.",
            "example": "oci_core_public_ip.nat.id"
          }
        ],
        "nOptionalMore": 4
      },
      {
        "key": "core_service_gateway",
        "name": "Service Gateway",
        "glyph": "SG",
        "rtype": "oci_core_service_gateway",
        "summary": "Private path to OCI services (Object Storage etc.) without public IPs.",
        "params": [
          {
            "name": "compartment_id",
            "required": true,
            "desc": "The OCID of the compartment to contain the service gateway.",
            "example": "var.compartment_ocid"
          },
          {
            "name": "services",
            "required": true,
            "desc": "List of the OCIDs of the Service objects to enable for the service gateway.",
            "example": "[{ service_id = data.oci_core_services.all.services[0].id }]"
          },
          {
            "name": "vcn_id",
            "required": true,
            "desc": "The OCID of the VCN.",
            "example": "oci_core_vcn.main.id"
          },
          {
            "name": "route_table_id",
            "required": false,
            "desc": "The OCID of the route table the service gateway will use.",
            "example": "oci_core_route_table.private.id"
          },
          {
            "name": "display_name",
            "required": false,
            "desc": "A user-friendly name.",
            "example": "\"acme-prod\""
          }
        ],
        "nOptionalMore": 2
      },
      {
        "key": "core_drg",
        "name": "DRG",
        "glyph": "DR",
        "rtype": "oci_core_drg",
        "summary": "Dynamic Routing Gateway for VPN, FastConnect and VCN peering.",
        "params": [
          {
            "name": "compartment_id",
            "required": true,
            "desc": "The OCID of the compartment to contain the DRG.",
            "example": "var.compartment_ocid"
          },
          {
            "name": "display_name",
            "required": false,
            "desc": "A user-friendly name.",
            "example": "\"acme-prod\""
          }
        ],
        "nOptionalMore": 2
      },
      {
        "key": "core_route_table",
        "name": "Route Table",
        "glyph": "RT",
        "rtype": "oci_core_route_table",
        "summary": "Routing rules that steer subnet traffic to gateways.",
        "params": [
          {
            "name": "compartment_id",
            "required": true,
            "desc": "The OCID of the compartment to contain the route table.",
            "example": "var.compartment_ocid"
          },
          {
            "name": "vcn_id",
            "required": true,
            "desc": "The OCID of the VCN the route table belongs to.",
            "example": "oci_core_vcn.main.id"
          },
          {
            "name": "route_rules",
            "required": false,
            "desc": "The collection of rules used for routing destination IPs to network devices.",
            "example": "{ destination = \"0.0.0.0/0\", network_entity_id = oci_core_internet_gateway.igw.id }"
          },
          {
            "name": "display_name",
            "required": false,
            "desc": "A user-friendly name.",
            "example": "\"acme-prod\""
          }
        ],
        "nOptionalMore": 2
      },
      {
        "key": "core_security_list",
        "name": "Security List",
        "glyph": "SL",
        "rtype": "oci_core_security_list",
        "summary": "Subnet-level stateful ingress/egress firewall rules.",
        "params": [
          {
            "name": "compartment_id",
            "required": true,
            "desc": "The OCID of the compartment to contain the security list.",
            "example": "var.compartment_ocid"
          },
          {
            "name": "vcn_id",
            "required": true,
            "desc": "The OCID of the VCN the security list belongs to.",
            "example": "oci_core_vcn.main.id"
          },
          {
            "name": "ingress_security_rules",
            "required": false,
            "desc": "Rules for allowing ingress IP packets.",
            "example": "{ protocol = \"6\", source = \"10.0.0.0/16\", tcp_options { min = 443, max = 443 } }"
          },
          {
            "name": "egress_security_rules",
            "required": false,
            "desc": "Rules for allowing egress IP packets.",
            "example": "{ protocol = \"all\", destination = \"0.0.0.0/0\" }"
          },
          {
            "name": "display_name",
            "required": false,
            "desc": "A user-friendly name.",
            "example": "\"acme-prod\""
          }
        ],
        "nOptionalMore": 2
      },
      {
        "key": "core_network_security_group",
        "name": "Network Security Group",
        "glyph": "NS",
        "rtype": "oci_core_network_security_group",
        "summary": "Resource-level virtual firewall; attach to VNICs, LBs and DBs.",
        "params": [
          {
            "name": "compartment_id",
            "required": true,
            "desc": "The OCID of the compartment to contain the network security group.",
            "example": "var.compartment_ocid"
          },
          {
            "name": "vcn_id",
            "required": true,
            "desc": "The OCID of the VCN to create the network security group in.",
            "example": "oci_core_vcn.main.id"
          },
          {
            "name": "display_name",
            "required": false,
            "desc": "A user-friendly name.",
            "example": "\"acme-prod\""
          }
        ],
        "nOptionalMore": 2
      },
      {
        "key": "load_balancer_load_balancer",
        "name": "Load Balancer",
        "glyph": "LB",
        "rtype": "oci_load_balancer_load_balancer",
        "summary": "Layer-7 HTTP(S) load balancer with flexible bandwidth shapes.",
        "params": [
          {
            "name": "compartment_id",
            "required": true,
            "desc": "The OCID of the compartment in which to create the load balancer.",
            "example": "var.compartment_ocid"
          },
          {
            "name": "display_name",
            "required": true,
            "desc": "A user-friendly name.",
            "example": "\"lb-acme-web\""
          },
          {
            "name": "shape",
            "required": true,
            "desc": "A template that determines the total pre-provisioned bandwidth (ingress plus egress).",
            "example": "\"flexible\""
          },
          {
            "name": "subnet_ids",
            "required": true,
            "desc": "An array of subnet OCIDs.",
            "example": "[oci_core_subnet.public.id]"
          },
          {
            "name": "shape_details",
            "required": false,
            "desc": "The configuration details to create load balancer using Flexible shape.",
            "example": "{ minimum_bandwidth_in_mbps = 10, maximum_bandwidth_in_mbps = 100 }"
          },
          {
            "name": "is_private",
            "required": false,
            "desc": "Whether the load balancer has a VCN-local (private) IP address.",
            "example": "true"
          },
          {
            "name": "network_security_group_ids",
            "required": false,
            "desc": "An array of NSG OCIDs associated with this load balancer.",
            "example": "[oci_core_network_security_group.web.id]"
          }
        ],
        "nOptionalMore": 10,
        "used": true
      },
      {
        "key": "network_load_balancer_network_load_balancer",
        "name": "Network Load Balancer",
        "glyph": "NL",
        "rtype": "oci_network_load_balancer_network_load_balancer",
        "summary": "Layer-4 TCP/UDP load balancer with low latency passthrough.",
        "params": [
          {
            "name": "compartment_id",
            "required": true,
            "desc": "The OCID of the compartment containing the network load balancer.",
            "example": "var.compartment_ocid"
          },
          {
            "name": "display_name",
            "required": true,
            "desc": "Network load balancer identifier, which can be renamed.",
            "example": "\"nlb-acme-edge\""
          },
          {
            "name": "subnet_id",
            "required": true,
            "desc": "The subnet in which the network load balancer is spawned OCIDs.",
            "example": "oci_core_subnet.private_app.id"
          },
          {
            "name": "is_private",
            "required": false,
            "desc": "Whether the network load balancer has a virtual cloud network-local (private) IP address.",
            "example": "true"
          },
          {
            "name": "is_preserve_source_destination",
            "required": false,
            "desc": "This parameter can be enabled only if backends are compute OCIDs.",
            "example": "false"
          }
        ],
        "nOptionalMore": 14
      },
      {
        "key": "apigateway_gateway",
        "name": "API Gateway",
        "glyph": "GW",
        "rtype": "oci_apigateway_gateway",
        "summary": "Managed API front door: routing, auth, rate limits, CORS.",
        "params": [
          {
            "name": "compartment_id",
            "required": true,
            "desc": "The OCID of the compartment in which the resource is created.",
            "example": "var.compartment_ocid"
          },
          {
            "name": "endpoint_type",
            "required": true,
            "desc": "Gateway endpoint type.",
            "example": "\"PUBLIC\""
          },
          {
            "name": "subnet_id",
            "required": true,
            "desc": "The OCID of the subnet in which related resources are created.",
            "example": "oci_core_subnet.private_app.id"
          },
          {
            "name": "display_name",
            "required": false,
            "desc": "A user-friendly name.",
            "example": "\"acme-prod\""
          },
          {
            "name": "network_security_group_ids",
            "required": false,
            "desc": "An array of Network Security Groups OCIDs associated with this API Gateway.",
            "example": "[oci_core_network_security_group.web.id]"
          }
        ],
        "nOptionalMore": 9,
        "used": true
      },
      {
        "key": "network_firewall_network_firewall",
        "name": "Network Firewall",
        "glyph": "FW",
        "rtype": "oci_network_firewall_network_firewall",
        "summary": "Palo Alto-powered inspection firewall inside the VCN.",
        "params": [
          {
            "name": "compartment_id",
            "required": true,
            "desc": "The OCID of the compartment containing the Network Firewall.",
            "example": "var.compartment_ocid"
          },
          {
            "name": "network_firewall_policy_id",
            "required": true,
            "desc": "The OCID of the Network Firewall Policy.",
            "example": "oci_network_firewall_network_firewall_policy.main.id"
          },
          {
            "name": "subnet_id",
            "required": true,
            "desc": "The OCID of the subnet associated with the Network Firewall.",
            "example": "oci_core_subnet.private_app.id"
          },
          {
            "name": "display_name",
            "required": false,
            "desc": "A user-friendly name for the Network Firewall.",
            "example": "\"acme-prod\""
          },
          {
            "name": "ipv4address",
            "required": false,
            "desc": "IPv4 address for the Network Firewall.",
            "example": "\"10.0.3.10\""
          }
        ],
        "nOptionalMore": 8
      },
      {
        "key": "dns_zone",
        "name": "DNS Zone",
        "glyph": "DN",
        "rtype": "oci_dns_zone",
        "summary": "Public or private DNS zone managed by OCI DNS.",
        "params": [
          {
            "name": "compartment_id",
            "required": true,
            "desc": "The OCID of the compartment containing the zone.",
            "example": "var.compartment_ocid"
          },
          {
            "name": "name",
            "required": true,
            "desc": "The name of the zone.",
            "example": "\"acme.example.com\""
          },
          {
            "name": "zone_type",
            "required": true,
            "desc": "The type of the zone.",
            "example": "\"PRIMARY\""
          },
          {
            "name": "scope",
            "required": false,
            "desc": "Specifies to operate only on resources that have a matching DNS scope.",
            "example": "\"PRIVATE\""
          },
          {
            "name": "view_id",
            "required": false,
            "desc": "The OCID of the private view containing the zone.",
            "example": "oci_dns_view.internal.id"
          }
        ],
        "nOptionalMore": 6
      }
    ]
  },
  {
    "name": "COMPUTE",
    "items": [
      {
        "key": "core_instance",
        "name": "Compute Instance",
        "glyph": "CI",
        "rtype": "oci_core_instance",
        "summary": "Bare metal or VM instance; shape, image and VNIC are set here.",
        "params": [
          {
            "name": "availability_domain",
            "required": true,
            "desc": "The availability domain of the instance.",
            "example": "\"Uhwc:EU-FRANKFURT-1-AD-1\""
          },
          {
            "name": "compartment_id",
            "required": true,
            "desc": "The OCID of the compartment.",
            "example": "var.compartment_ocid"
          },
          {
            "name": "shape",
            "required": false,
            "desc": "The shape of an instance.",
            "example": "\"VM.Standard.E5.Flex\""
          },
          {
            "name": "shape_config",
            "required": false,
            "desc": "The shape configuration requested for the instance.",
            "example": "{ ocpus = 2, memory_in_gbs = 16 }"
          },
          {
            "name": "source_details",
            "required": false,
            "desc": ".",
            "example": "{ source_type = \"image\", source_id = var.image_ocid }"
          },
          {
            "name": "create_vnic_details",
            "required": false,
            "desc": "Contains properties for a VNIC.",
            "example": "{ subnet_id = oci_core_subnet.private_app.id }"
          }
        ],
        "nOptionalMore": 30,
        "used": true
      },
      {
        "key": "core_instance_pool",
        "name": "Instance Pool",
        "glyph": "IP",
        "rtype": "oci_core_instance_pool",
        "summary": "Managed group of identical instances from an instance configuration.",
        "params": [
          {
            "name": "compartment_id",
            "required": true,
            "desc": "The OCID of the compartment containing the instance pool.",
            "example": "var.compartment_ocid"
          },
          {
            "name": "instance_configuration_id",
            "required": true,
            "desc": "The OCID of the instance configuration associated with the instance pool.",
            "example": "oci_core_instance_configuration.app.id"
          },
          {
            "name": "placement_configurations",
            "required": true,
            "desc": "The placement configurations for the instance pool.",
            "example": "{ availability_domain = \"\u2026AD-1\", primary_subnet_id = oci_core_subnet.private_app.id }"
          },
          {
            "name": "size",
            "required": true,
            "desc": "The number of instances that should be in the instance pool.",
            "example": "2"
          },
          {
            "name": "display_name",
            "required": false,
            "desc": "A user-friendly name.",
            "example": "\"acme-prod\""
          },
          {
            "name": "load_balancers",
            "required": false,
            "desc": "The load balancers to attach to the instance pool.",
            "example": "{ load_balancer_id = oci_load_balancer_load_balancer.web.id, backend_set_name = \"app\", port = 8080 }"
          }
        ],
        "nOptionalMore": 6
      },
      {
        "key": "containerengine_cluster",
        "name": "OKE Cluster",
        "glyph": "K8",
        "rtype": "oci_containerengine_cluster",
        "summary": "Managed Kubernetes control plane (Container Engine for Kubernetes).",
        "params": [
          {
            "name": "compartment_id",
            "required": true,
            "desc": "The OCID of the compartment in which to create the cluster.",
            "example": "var.compartment_ocid"
          },
          {
            "name": "kubernetes_version",
            "required": true,
            "desc": "The version of Kubernetes to install into the cluster masters.",
            "example": "\"v1.31.1\""
          },
          {
            "name": "name",
            "required": true,
            "desc": "The name of the cluster.",
            "example": "\"oke-acme-prod\""
          },
          {
            "name": "vcn_id",
            "required": true,
            "desc": "The OCID of the virtual cloud network (VCN) in which to create the cluster.",
            "example": "oci_core_vcn.main.id"
          },
          {
            "name": "type",
            "required": false,
            "desc": "Type of cluster.",
            "example": "\"ENHANCED_CLUSTER\""
          },
          {
            "name": "endpoint_config",
            "required": false,
            "desc": "The network configuration for access to the Cluster control plane.",
            "example": "{ is_public_ip_enabled = false, subnet_id = oci_core_subnet.private_app.id }"
          },
          {
            "name": "options",
            "required": false,
            "desc": "Optional attributes for the cluster.",
            "example": "{ service_lb_subnet_ids = [oci_core_subnet.public.id] }"
          }
        ],
        "nOptionalMore": 5,
        "used": true
      },
      {
        "key": "containerengine_node_pool",
        "name": "OKE Node Pool",
        "glyph": "NP",
        "rtype": "oci_containerengine_node_pool",
        "summary": "Worker node pool for an OKE cluster; shape and size per pool.",
        "params": [
          {
            "name": "cluster_id",
            "required": true,
            "desc": "The OCID of the cluster to which this node pool is attached.",
            "example": "oci_containerengine_cluster.oke.id"
          },
          {
            "name": "compartment_id",
            "required": true,
            "desc": "The OCID of the compartment in which the node pool exists.",
            "example": "var.compartment_ocid"
          },
          {
            "name": "name",
            "required": true,
            "desc": "The name of the node pool.",
            "example": "\"np-general\""
          },
          {
            "name": "node_shape",
            "required": true,
            "desc": "The name of the node shape of the nodes in the node pool.",
            "example": "\"VM.Standard.E5.Flex\""
          },
          {
            "name": "kubernetes_version",
            "required": false,
            "desc": "The version of Kubernetes to install on the nodes in the node pool.",
            "example": "\"v1.31.1\""
          },
          {
            "name": "node_config_details",
            "required": false,
            "desc": "The configuration of nodes in the node pool.",
            "example": "{ size = 3, placement_configs { availability_domain = \u2026, subnet_id = \u2026 } }"
          },
          {
            "name": "node_shape_config",
            "required": false,
            "desc": "Specify the configuration of the shape to launch nodes in the node pool.",
            "example": "{ ocpus = 2, memory_in_gbs = 16 }"
          }
        ],
        "nOptionalMore": 14
      },
      {
        "key": "functions_application",
        "name": "Functions Application",
        "glyph": "FA",
        "rtype": "oci_functions_application",
        "summary": "Grouping and network context for serverless functions.",
        "params": [
          {
            "name": "compartment_id",
            "required": true,
            "desc": "The OCID of the compartment to create the application within.",
            "example": "var.compartment_ocid"
          },
          {
            "name": "display_name",
            "required": true,
            "desc": "The display name of the application.",
            "example": "\"fn-app-acme\""
          },
          {
            "name": "subnet_ids",
            "required": true,
            "desc": "The OCIDs of the subnets in which to run functions in the application.",
            "example": "[oci_core_subnet.public.id]"
          },
          {
            "name": "shape",
            "required": false,
            "desc": "Valid values are `GENERIC_X86`, `GENERIC_ARM` and `GENERIC_X86_ARM`.",
            "example": "\"GENERIC_X86\""
          },
          {
            "name": "config",
            "required": false,
            "desc": "Application configuration.",
            "example": "{ \"LOG_LEVEL\" = \"info\" }"
          },
          {
            "name": "network_security_group_ids",
            "required": false,
            "desc": "The OCIDs of the Network Security Groups to add the application to.",
            "example": "[oci_core_network_security_group.web.id]"
          }
        ],
        "nOptionalMore": 7
      },
      {
        "key": "functions_function",
        "name": "Function",
        "glyph": "FN",
        "rtype": "oci_functions_function",
        "summary": "Single serverless function deployed from a container image.",
        "params": [
          {
            "name": "application_id",
            "required": true,
            "desc": "The OCID of the application this function belongs to.",
            "example": "oci_functions_application.app.id"
          },
          {
            "name": "display_name",
            "required": true,
            "desc": "The display name of the function.",
            "example": "\"checkout-handler\""
          },
          {
            "name": "memory_in_mbs",
            "required": true,
            "desc": "Maximum usable memory for the function (MiB).",
            "example": "256"
          },
          {
            "name": "image",
            "required": false,
            "desc": "The qualified name of the Docker image to use in the function, including the image tag.",
            "example": "\"fra.ocir.io/acme/checkout:1.4.2\""
          },
          {
            "name": "timeout_in_seconds",
            "required": false,
            "desc": "Timeout for executions of the function.",
            "example": "30"
          },
          {
            "name": "provisioned_concurrency_config",
            "required": false,
            "desc": "Define the strategy for provisioned concurrency for the function.",
            "example": "{ strategy = \"CONSTANT\", count = 10 }"
          }
        ],
        "nOptionalMore": 9
      }
    ]
  },
  {
    "name": "DATABASE",
    "items": [
      {
        "key": "database_autonomous_database",
        "name": "Autonomous DB",
        "glyph": "DB",
        "rtype": "oci_database_autonomous_database",
        "summary": "Self-tuning Oracle database; OLTP, DW or JSON workloads.",
        "params": [
          {
            "name": "compartment_id",
            "required": true,
            "desc": "The OCID of the compartment of the Autonomous AI Database.",
            "example": "var.compartment_ocid"
          },
          {
            "name": "db_name",
            "required": false,
            "desc": "The database name.",
            "example": "\"acmeprod\""
          },
          {
            "name": "db_workload",
            "required": false,
            "desc": "The Autonomous AI Database workload type.",
            "example": "\"OLTP\""
          },
          {
            "name": "compute_count",
            "required": false,
            "desc": "The compute amount (CPUs) available to the database.",
            "example": "4"
          },
          {
            "name": "data_storage_size_in_tbs",
            "required": false,
            "desc": "The size, in terabytes, of the data volume that will be created and attached to the database.",
            "example": "1"
          },
          {
            "name": "is_auto_scaling_enabled",
            "required": false,
            "desc": "Indicates if auto scaling is enabled for the Autonomous AI Database CPU core count.",
            "example": "true"
          },
          {
            "name": "subnet_id",
            "required": false,
            "desc": "The OCID of the subnet the resource is associated with.",
            "example": "oci_core_subnet.private_app.id"
          }
        ],
        "nOptionalMore": 54,
        "used": true
      },
      {
        "key": "database_db_system",
        "name": "Base DB System",
        "glyph": "DS",
        "rtype": "oci_database_db_system",
        "summary": "Traditional Oracle DB on dedicated VM/BM you size and patch.",
        "params": [
          {
            "name": "availability_domain",
            "required": true,
            "desc": "The availability domain where the DB system is located.",
            "example": "\"Uhwc:EU-FRANKFURT-1-AD-1\""
          },
          {
            "name": "compartment_id",
            "required": true,
            "desc": "The OCID of the compartment the DB system  belongs in.",
            "example": "var.compartment_ocid"
          },
          {
            "name": "db_home",
            "required": true,
            "desc": "Details for creating a Database Home if you are creating a database by restoring from a database backup.",
            "example": "{ database { db_name = \"acmeprod\" } }"
          },
          {
            "name": "hostname",
            "required": true,
            "desc": "The hostname for the DB system.",
            "example": "\"db-host\""
          },
          {
            "name": "shape",
            "required": true,
            "desc": "The shape of the DB system.",
            "example": "\"VM.Standard.E5.Flex\""
          },
          {
            "name": "ssh_public_keys",
            "required": true,
            "desc": "The public key portion of the key pair to use for SSH access to the DB system.",
            "example": "[var.ssh_public_key]"
          },
          {
            "name": "subnet_id",
            "required": true,
            "desc": "The OCID of the subnet the DB system is associated with.",
            "example": "oci_core_subnet.private_app.id"
          },
          {
            "name": "license_model",
            "required": false,
            "desc": "The Oracle license model that applies to all the databases on the DB system.",
            "example": "var.db_system_license_model"
          },
          {
            "name": "node_count",
            "required": false,
            "desc": "The number of nodes to launch for a virtual machine DB system.",
            "example": "1"
          },
          {
            "name": "data_storage_size_in_gb",
            "required": false,
            "desc": "Size (in GB) of the initial data volume that will be created and attached to a virtual machine DB system.",
            "example": "100"
          }
        ],
        "nOptionalMore": 26
      },
      {
        "key": "mysql_mysql_db_system",
        "name": "MySQL HeatWave",
        "glyph": "MY",
        "rtype": "oci_mysql_mysql_db_system",
        "summary": "Managed MySQL with optional HeatWave analytics acceleration.",
        "params": [
          {
            "name": "availability_domain",
            "required": true,
            "desc": "The availability domain on which to deploy the Read/Write endpoint.",
            "example": "\"Uhwc:EU-FRANKFURT-1-AD-1\""
          },
          {
            "name": "compartment_id",
            "required": true,
            "desc": "The OCID of the compartment.",
            "example": "var.compartment_ocid"
          },
          {
            "name": "shape_name",
            "required": true,
            "desc": "The name of the shape.",
            "example": "\"MySQL.VM.Standard.E4.1.8GB\""
          },
          {
            "name": "subnet_id",
            "required": true,
            "desc": "The OCID of the subnet the DB System is associated with.",
            "example": "oci_core_subnet.private_app.id"
          },
          {
            "name": "admin_username",
            "required": false,
            "desc": "The username for the administrative user.",
            "example": "\"admin\""
          },
          {
            "name": "admin_password",
            "required": false,
            "desc": "The password for the administrative user.",
            "example": "var.mysql_admin_password"
          },
          {
            "name": "data_storage_size_in_gb",
            "required": false,
            "desc": "Initial size of the data volume in GBs that will be created and attached.",
            "example": "100"
          },
          {
            "name": "is_highly_available",
            "required": false,
            "desc": "Specifies if the DB System is highly available.",
            "example": "true"
          }
        ],
        "nOptionalMore": 33
      },
      {
        "key": "psql_db_system",
        "name": "PostgreSQL",
        "glyph": "PG",
        "rtype": "oci_psql_db_system",
        "summary": "OCI Database with PostgreSQL \u2014 managed Postgres db system.",
        "params": [
          {
            "name": "compartment_id",
            "required": true,
            "desc": "The OCID of the compartment that contains the database system.",
            "example": "var.compartment_ocid"
          },
          {
            "name": "db_version",
            "required": true,
            "desc": "Version of database system software.",
            "example": "\"16\""
          },
          {
            "name": "display_name",
            "required": true,
            "desc": "A user-friendly display name for the database system.",
            "example": "\"pg-acme-prod\""
          },
          {
            "name": "network_details",
            "required": true,
            "desc": "Network details for the database system.",
            "example": "{ subnet_id = oci_core_subnet.private_db.id }"
          },
          {
            "name": "shape",
            "required": true,
            "desc": "The name of the shape for the database instance node.",
            "example": "\"PostgreSQL.VM.Standard.E5.Flex\""
          },
          {
            "name": "storage_details",
            "required": true,
            "desc": "Storage details of the database system.",
            "example": "{ system_type = \"OCI_OPTIMIZED_STORAGE\", is_regionally_durable = true }"
          },
          {
            "name": "instance_count",
            "required": false,
            "desc": "Count of database instances nodes to be created in the database system.",
            "example": "1"
          },
          {
            "name": "credentials",
            "required": false,
            "desc": "Initial database system credentials that the database system will be provisioned with.",
            "example": "{ username = \"admin\", password_details { password_type = \"PLAIN_TEXT\" } }"
          }
        ],
        "nOptionalMore": 16
      },
      {
        "key": "nosql_table",
        "name": "NoSQL Table",
        "glyph": "NQ",
        "rtype": "oci_nosql_table",
        "summary": "Serverless NoSQL table with provisioned or on-demand throughput.",
        "params": [
          {
            "name": "compartment_id",
            "required": true,
            "desc": "Compartment Identifier.",
            "example": "var.compartment_ocid"
          },
          {
            "name": "ddl_statement",
            "required": true,
            "desc": "CREATE TABLE DDL statement.",
            "example": "\"CREATE TABLE users(id INTEGER, name STRING, PRIMARY KEY(id))\""
          },
          {
            "name": "name",
            "required": true,
            "desc": "Table name.",
            "example": "\"users\""
          },
          {
            "name": "table_limits",
            "required": false,
            "desc": "Throughput and storage limits configuration of a table.",
            "example": "{ max_read_units = 50, max_write_units = 50, max_storage_in_gbs = 25 }"
          },
          {
            "name": "is_auto_reclaimable",
            "required": false,
            "desc": "True if table can be reclaimed after an idle period.",
            "example": "false"
          }
        ],
        "nOptionalMore": 2
      },
      {
        "key": "redis_redis_cluster",
        "name": "OCI Cache (Redis)",
        "glyph": "RC",
        "rtype": "oci_redis_redis_cluster",
        "summary": "Managed Redis-compatible in-memory cache cluster.",
        "params": [
          {
            "name": "compartment_id",
            "required": true,
            "desc": "The OCID of the compartment that contains the cluster.",
            "example": "var.compartment_ocid"
          },
          {
            "name": "display_name",
            "required": true,
            "desc": "A user-friendly name.",
            "example": "\"cache-acme-prod\""
          },
          {
            "name": "node_count",
            "required": true,
            "desc": "The number of nodes per shard in the cluster when clusterMode is SHARDED.",
            "example": "3"
          },
          {
            "name": "node_memory_in_gbs",
            "required": true,
            "desc": "The amount of memory allocated to the cluster's nodes, in gigabytes.",
            "example": "16"
          },
          {
            "name": "software_version",
            "required": true,
            "desc": "The Oracle Cloud Infrastructure Cache engine version that the cluster is running.",
            "example": "\"REDIS_7_0\""
          },
          {
            "name": "subnet_id",
            "required": true,
            "desc": "The OCID of the cluster's subnet.",
            "example": "oci_core_subnet.private_app.id"
          },
          {
            "name": "cluster_mode",
            "required": false,
            "desc": "Specifies whether the cluster is sharded or non-sharded.",
            "example": "\"SHARDED\""
          },
          {
            "name": "shard_count",
            "required": false,
            "desc": "The number of shards in sharded cluster.",
            "example": "3"
          }
        ],
        "nOptionalMore": 7
      }
    ]
  },
  {
    "name": "STORAGE",
    "items": [
      {
        "key": "objectstorage_bucket",
        "name": "Object Storage",
        "glyph": "OS",
        "rtype": "oci_objectstorage_bucket",
        "summary": "Bucket for objects; visibility, versioning and lifecycle rules.",
        "params": [
          {
            "name": "compartment_id",
            "required": true,
            "desc": "The ID of the compartment in which to create the bucket.",
            "example": "var.compartment_ocid"
          },
          {
            "name": "name",
            "required": true,
            "desc": "The name of the bucket.",
            "example": "\"acme-prod-assets\""
          },
          {
            "name": "namespace",
            "required": true,
            "desc": "The Object Storage namespace used for the request.",
            "example": "\"axk2fbydxdkn\""
          },
          {
            "name": "access_type",
            "required": false,
            "desc": "The type of public access enabled on this bucket.",
            "example": "\"NoPublicAccess\""
          },
          {
            "name": "versioning",
            "required": false,
            "desc": "Set the versioning status on the bucket.",
            "example": "\"Enabled\""
          },
          {
            "name": "storage_tier",
            "required": false,
            "desc": "The type of storage tier of this bucket.",
            "example": "\"Standard\""
          },
          {
            "name": "kms_key_id",
            "required": false,
            "desc": "The OCID of a master encryption key used to call the Key Management service to generate a data encryption key or to encrypt or decrypt a data encryption key.",
            "example": "oci_kms_key.main.id"
          }
        ],
        "nOptionalMore": 8,
        "used": true
      },
      {
        "key": "core_volume",
        "name": "Block Volume",
        "glyph": "BV",
        "rtype": "oci_core_volume",
        "summary": "Attachable block storage volume; size and performance (VPUs).",
        "params": [
          {
            "name": "compartment_id",
            "required": true,
            "desc": "The OCID of the compartment that contains the volume.",
            "example": "var.compartment_ocid"
          },
          {
            "name": "availability_domain",
            "required": false,
            "desc": "The availability domain of the volume.",
            "example": "\"Uhwc:EU-FRANKFURT-1-AD-1\""
          },
          {
            "name": "size_in_gbs",
            "required": false,
            "desc": "The size of the volume in GBs.",
            "example": "100"
          },
          {
            "name": "vpus_per_gb",
            "required": false,
            "desc": "The number of volume performance units (VPUs) that will be applied to this volume per GB, representing the Block Volume service's elastic performance options.",
            "example": "10"
          },
          {
            "name": "kms_key_id",
            "required": false,
            "desc": "The OCID of the Vault service key to assign as the master encryption key for the volume.",
            "example": "oci_kms_key.main.id"
          }
        ],
        "nOptionalMore": 13
      },
      {
        "key": "file_storage_file_system",
        "name": "File Storage",
        "glyph": "FS",
        "rtype": "oci_file_storage_file_system",
        "summary": "Elastic NFS file system.",
        "params": [
          {
            "name": "availability_domain",
            "required": true,
            "desc": "The availability domain to create the file system in.",
            "example": "\"Uhwc:EU-FRANKFURT-1-AD-1\""
          },
          {
            "name": "compartment_id",
            "required": true,
            "desc": "The OCID of the compartment to create the file system in.",
            "example": "var.compartment_ocid"
          },
          {
            "name": "display_name",
            "required": false,
            "desc": "A user-friendly name.",
            "example": "\"acme-prod\""
          },
          {
            "name": "kms_key_id",
            "required": false,
            "desc": "The OCID of KMS key used to encrypt the encryption keys associated with this file system.",
            "example": "oci_kms_key.main.id"
          }
        ],
        "nOptionalMore": 8
      },
      {
        "key": "file_storage_mount_target",
        "name": "Mount Target",
        "glyph": "MT",
        "rtype": "oci_file_storage_mount_target",
        "summary": "NFS endpoint in a subnet that exports file systems.",
        "params": [
          {
            "name": "availability_domain",
            "required": true,
            "desc": "The availability domain in which to create the mount target.",
            "example": "\"Uhwc:EU-FRANKFURT-1-AD-1\""
          },
          {
            "name": "compartment_id",
            "required": true,
            "desc": "The OCID of the compartment in which to create the mount target.",
            "example": "var.compartment_ocid"
          },
          {
            "name": "subnet_id",
            "required": true,
            "desc": "The OCID of the subnet in which to create the mount target.",
            "example": "oci_core_subnet.private_app.id"
          },
          {
            "name": "display_name",
            "required": false,
            "desc": "A user-friendly name.",
            "example": "\"acme-prod\""
          },
          {
            "name": "hostname_label",
            "required": false,
            "desc": "The hostname for the mount target's IP address, used for DNS resolution.",
            "example": "\"nfs01\""
          }
        ],
        "nOptionalMore": 11
      }
    ]
  },
  {
    "name": "SECURITY",
    "items": [
      {
        "key": "kms_vault",
        "name": "Vault",
        "glyph": "VT",
        "rtype": "oci_kms_vault",
        "summary": "KMS vault holding encryption keys and secrets.",
        "params": [
          {
            "name": "compartment_id",
            "required": true,
            "desc": "The OCID of the compartment where you want to create this vault.",
            "example": "var.compartment_ocid"
          },
          {
            "name": "display_name",
            "required": true,
            "desc": "A user-friendly name for the vault.",
            "example": "\"vault-acme-prod\""
          },
          {
            "name": "vault_type",
            "required": true,
            "desc": "The type of vault to create.",
            "example": "\"DEFAULT\""
          }
        ],
        "nOptionalMore": 6
      },
      {
        "key": "kms_key",
        "name": "KMS Key",
        "glyph": "KY",
        "rtype": "oci_kms_key",
        "summary": "Customer-managed encryption key (AES/RSA/ECDSA) in a vault.",
        "params": [
          {
            "name": "compartment_id",
            "required": true,
            "desc": "The OCID of the compartment where you want to create the master encryption key.",
            "example": "var.compartment_ocid"
          },
          {
            "name": "display_name",
            "required": true,
            "desc": "A user-friendly name for the key.",
            "example": "\"key-acme-data\""
          },
          {
            "name": "key_shape",
            "required": true,
            "desc": "The cryptographic properties of a key.",
            "example": "{ algorithm = \"AES\", length = 32 }"
          },
          {
            "name": "management_endpoint",
            "required": true,
            "desc": "The service endpoint to perform management operations against.",
            "example": "oci_kms_vault.main.management_endpoint"
          },
          {
            "name": "protection_mode",
            "required": false,
            "desc": "The key's protection mode indicates how the key persists and where cryptographic operations that use the key are performed.",
            "example": "\"HSM\""
          }
        ],
        "nOptionalMore": 10
      },
      {
        "key": "vault_secret",
        "name": "Secret",
        "glyph": "SC",
        "rtype": "oci_vault_secret",
        "summary": "Versioned secret (passwords, tokens) stored in a vault.",
        "params": [
          {
            "name": "compartment_id",
            "required": true,
            "desc": "The OCID of the compartment where you want to create the secret.",
            "example": "var.compartment_ocid"
          },
          {
            "name": "key_id",
            "required": true,
            "desc": "The OCID of the master encryption key that is used to encrypt the secret.",
            "example": "oci_kms_key.main.id"
          },
          {
            "name": "secret_name",
            "required": true,
            "desc": "A user-friendly name for the secret.",
            "example": "\"db-admin-password\""
          },
          {
            "name": "vault_id",
            "required": true,
            "desc": "The OCID of the vault where you want to create the secret.",
            "example": "oci_kms_vault.main.id"
          },
          {
            "name": "secret_content",
            "required": false,
            "desc": "The content of the secret and metadata to help identify it.",
            "example": "{ content_type = \"BASE64\", content = var.secret_b64 }"
          },
          {
            "name": "description",
            "required": false,
            "desc": "A brief description of the secret.",
            "example": "\"Managed by Kladen\""
          }
        ],
        "nOptionalMore": 8
      },
      {
        "key": "bastion_bastion",
        "name": "Bastion",
        "glyph": "BA",
        "rtype": "oci_bastion_bastion",
        "summary": "Managed SSH jump host for reaching private resources.",
        "params": [
          {
            "name": "bastion_type",
            "required": true,
            "desc": "The type of bastion.",
            "example": "\"STANDARD\""
          },
          {
            "name": "compartment_id",
            "required": true,
            "desc": "The unique identifier (OCID) of the compartment where the bastion is located.",
            "example": "var.compartment_ocid"
          },
          {
            "name": "target_subnet_id",
            "required": true,
            "desc": "The unique identifier (OCID) of the subnet that the bastion connects to.",
            "example": "oci_core_subnet.private_app.id"
          },
          {
            "name": "client_cidr_block_allow_list",
            "required": false,
            "desc": "A list of address ranges in CIDR notation that you want to allow to connect to sessions hosted by this bastion.",
            "example": "[\"203.0.113.0/24\"]"
          },
          {
            "name": "max_session_ttl_in_seconds",
            "required": false,
            "desc": "The maximum amount of time that any session on the bastion can remain active.",
            "example": "10800"
          }
        ],
        "nOptionalMore": 7
      },
      {
        "key": "waf_web_app_firewall",
        "name": "WAF",
        "glyph": "WF",
        "rtype": "oci_waf_web_app_firewall",
        "summary": "Web Application Firewall attached to a load balancer.",
        "params": [
          {
            "name": "backend_type",
            "required": true,
            "desc": "Type of the WebAppFirewall, as example LOAD_BALANCER.",
            "example": "\"LOAD_BALANCER\""
          },
          {
            "name": "compartment_id",
            "required": true,
            "desc": "The OCID of the compartment.",
            "example": "var.compartment_ocid"
          },
          {
            "name": "load_balancer_id",
            "required": true,
            "desc": "LoadBalancer OCID to which the WebAppFirewallPolicy is attached to.",
            "example": "oci_load_balancer_load_balancer.web.id"
          },
          {
            "name": "web_app_firewall_policy_id",
            "required": true,
            "desc": "The OCID of WebAppFirewallPolicy, which is attached to the resource.",
            "example": "oci_waf_web_app_firewall_policy.main.id"
          },
          {
            "name": "display_name",
            "required": false,
            "desc": "WebAppFirewall display name, can be renamed.",
            "example": "\"waf-acme-web\""
          }
        ],
        "nOptionalMore": 3
      },
      {
        "key": "certificates_management_certificate",
        "name": "Certificate",
        "glyph": "CT",
        "rtype": "oci_certificates_management_certificate",
        "summary": "TLS certificate issued or imported via Certificates service.",
        "params": [
          {
            "name": "certificate_config",
            "required": true,
            "desc": "The details of the contents of the certificate and certificate metadata.",
            "example": "{ config_type = \"ISSUED_BY_INTERNAL_CA\", certificate_profile_type = \"TLS_SERVER_OR_CLIENT\" }"
          },
          {
            "name": "compartment_id",
            "required": true,
            "desc": "The OCID of the compartment where you want to create the certificate.",
            "example": "var.compartment_ocid"
          },
          {
            "name": "name",
            "required": true,
            "desc": "A user-friendly name for the certificate.",
            "example": "\"cert-acme-web\""
          },
          {
            "name": "description",
            "required": false,
            "desc": "A brief description of the certificate.",
            "example": "\"Managed by Kladen\""
          }
        ],
        "nOptionalMore": 4
      }
    ]
  },
  {
    "name": "IDENTITY",
    "items": [
      {
        "key": "identity_compartment",
        "name": "Compartment",
        "glyph": "CP",
        "rtype": "oci_identity_compartment",
        "summary": "Isolation and policy boundary that contains resources.",
        "params": [
          {
            "name": "compartment_id",
            "required": true,
            "desc": "The OCID of the parent compartment containing the compartment.",
            "example": "var.parent_compartment_ocid"
          },
          {
            "name": "description",
            "required": true,
            "desc": "The description you assign to the compartment during creation.",
            "example": "\"Managed by Kladen\""
          },
          {
            "name": "name",
            "required": true,
            "desc": "The name you assign to the compartment during creation.",
            "example": "\"acme-prod\""
          },
          {
            "name": "enable_delete",
            "required": false,
            "desc": "Defaults to false.",
            "example": "true"
          }
        ],
        "nOptionalMore": 2
      },
      {
        "key": "identity_group",
        "name": "Group",
        "glyph": "GR",
        "rtype": "oci_identity_group",
        "summary": "IAM group of users for policy grants.",
        "params": [
          {
            "name": "compartment_id",
            "required": true,
            "desc": "The OCID of the tenancy containing the group.",
            "example": "var.compartment_ocid"
          },
          {
            "name": "description",
            "required": true,
            "desc": "The description you assign to the group during creation.",
            "example": "\"Managed by Kladen\""
          },
          {
            "name": "name",
            "required": true,
            "desc": "The name you assign to the group during creation.",
            "example": "\"AppDevs\""
          }
        ],
        "nOptionalMore": 2
      },
      {
        "key": "identity_dynamic_group",
        "name": "Dynamic Group",
        "glyph": "DG",
        "rtype": "oci_identity_dynamic_group",
        "summary": "Rule-matched group of resources (instances, functions) for policies.",
        "params": [
          {
            "name": "compartment_id",
            "required": true,
            "desc": "The OCID of the tenancy containing the group.",
            "example": "var.compartment_ocid"
          },
          {
            "name": "description",
            "required": true,
            "desc": "The description you assign to the group during creation.",
            "example": "\"Managed by Kladen\""
          },
          {
            "name": "matching_rule",
            "required": true,
            "desc": "The matching rule to dynamically match an instance certificate to this dynamic group.",
            "example": "\"ALL {instance.compartment.id = 'ocid1.compartment.oc1..aa\u2026'}\""
          },
          {
            "name": "name",
            "required": true,
            "desc": "The name you assign to the group during creation.",
            "example": "\"prod-instances\""
          }
        ],
        "nOptionalMore": 2
      },
      {
        "key": "identity_policy",
        "name": "IAM Policy",
        "glyph": "PL",
        "rtype": "oci_identity_policy",
        "summary": "Policy statements granting groups access in a compartment.",
        "params": [
          {
            "name": "compartment_id",
            "required": true,
            "desc": "The OCID of the compartment containing the policy (either the tenancy or another compartment).",
            "example": "var.compartment_ocid"
          },
          {
            "name": "description",
            "required": true,
            "desc": "The description you assign to the policy during creation.",
            "example": "\"Managed by Kladen\""
          },
          {
            "name": "name",
            "required": true,
            "desc": "The name you assign to the policy during creation.",
            "example": "\"appdevs-manage-compute\""
          },
          {
            "name": "statements",
            "required": true,
            "desc": "An array of policy statements written in the policy language.",
            "example": "[\"Allow group AppDevs to manage instances in compartment acme-prod\"]"
          },
          {
            "name": "version_date",
            "required": false,
            "desc": "The version of the policy.",
            "example": "\"2026-01-01\""
          }
        ],
        "nOptionalMore": 2
      }
    ]
  },
  {
    "name": "OBSERVABILITY",
    "items": [
      {
        "key": "logging_log_group",
        "name": "Log Group",
        "glyph": "LG",
        "rtype": "oci_logging_log_group",
        "summary": "Container that organizes service and custom logs.",
        "params": [
          {
            "name": "compartment_id",
            "required": true,
            "desc": "The OCID of the compartment that the resource belongs to.",
            "example": "var.compartment_ocid"
          },
          {
            "name": "display_name",
            "required": true,
            "desc": "The user-friendly display name.",
            "example": "\"lg-acme-prod\""
          },
          {
            "name": "description",
            "required": false,
            "desc": "Description for this resource.",
            "example": "\"Managed by Kladen\""
          }
        ],
        "nOptionalMore": 2
      },
      {
        "key": "logging_log",
        "name": "Log",
        "glyph": "LO",
        "rtype": "oci_logging_log",
        "summary": "Service or custom log routed into a log group.",
        "params": [
          {
            "name": "display_name",
            "required": true,
            "desc": "The user-friendly display name.",
            "example": "\"lb-access-logs\""
          },
          {
            "name": "log_group_id",
            "required": true,
            "desc": "OCID of a log group to work with.",
            "example": "oci_logging_log_group.main.id"
          },
          {
            "name": "log_type",
            "required": true,
            "desc": "The logType that the log object is for, whether custom or service.",
            "example": "\"SERVICE\""
          },
          {
            "name": "is_enabled",
            "required": false,
            "desc": "Whether or not this resource is currently enabled.",
            "example": "true"
          },
          {
            "name": "retention_duration",
            "required": false,
            "desc": "Log retention duration in 30-day increments (30, 60, 90 and so on until 180).",
            "example": "30"
          },
          {
            "name": "configuration",
            "required": false,
            "desc": "Log object configuration.",
            "example": "{ source { service = \"objectstorage\", category = \"write\" } }"
          }
        ],
        "nOptionalMore": 2
      },
      {
        "key": "monitoring_alarm",
        "name": "Alarm",
        "glyph": "AL",
        "rtype": "oci_monitoring_alarm",
        "summary": "Metric alarm (MQL query) that notifies a topic when it fires.",
        "params": [
          {
            "name": "compartment_id",
            "required": true,
            "desc": "The OCID of the compartment containing the alarm.",
            "example": "var.compartment_ocid"
          },
          {
            "name": "destinations",
            "required": true,
            "desc": "A list of destinations for alarm notifications.",
            "example": "[oci_ons_notification_topic.ops.id]"
          },
          {
            "name": "display_name",
            "required": true,
            "desc": "A user-friendly name for the alarm.",
            "example": "\"high-cpu-app-tier\""
          },
          {
            "name": "is_enabled",
            "required": true,
            "desc": "Whether the alarm is enabled.",
            "example": "true"
          },
          {
            "name": "metric_compartment_id",
            "required": true,
            "desc": "The OCID of the compartment containing the metric being evaluated by the alarm.",
            "example": "var.compartment_ocid"
          },
          {
            "name": "namespace",
            "required": true,
            "desc": "The source service or application emitting the metric that is evaluated by the alarm.",
            "example": "\"oci_computeagent\""
          },
          {
            "name": "query",
            "required": true,
            "desc": "The Monitoring Query Language (MQL) expression to evaluate for the alarm.",
            "example": "\"CpuUtilization[1m].mean() > 80\""
          },
          {
            "name": "severity",
            "required": true,
            "desc": "The perceived type of response required when the alarm is in the \"FIRING\" state.",
            "example": "\"CRITICAL\""
          },
          {
            "name": "resolution",
            "required": false,
            "desc": "The time between calculated aggregation windows for the alarm.",
            "example": "\"1m\""
          },
          {
            "name": "pending_duration",
            "required": false,
            "desc": "The period of time that the condition defined in the alarm must persist before the alarm state changes from \"OK\" to \"FIRING\".",
            "example": "\"PT5M\""
          }
        ],
        "nOptionalMore": 15
      },
      {
        "key": "ons_notification_topic",
        "name": "Notification Topic",
        "glyph": "NT",
        "rtype": "oci_ons_notification_topic",
        "summary": "Pub/sub topic delivering alerts to email, Slack, PagerDuty, functions.",
        "params": [
          {
            "name": "compartment_id",
            "required": true,
            "desc": "The OCID of the compartment to create the topic in.",
            "example": "var.compartment_ocid"
          },
          {
            "name": "name",
            "required": true,
            "desc": "The name of the topic being created.",
            "example": "\"ops-alerts\""
          },
          {
            "name": "description",
            "required": false,
            "desc": "The description of the topic being created.",
            "example": "\"Managed by Kladen\""
          }
        ],
        "nOptionalMore": 2
      },
      {
        "key": "events_rule",
        "name": "Event Rule",
        "glyph": "ER",
        "rtype": "oci_events_rule",
        "summary": "Reacts to OCI events (create/update/delete) and triggers actions.",
        "params": [
          {
            "name": "actions",
            "required": true,
            "desc": "A list of ActionDetails objects to create for a rule.",
            "example": "{ actions { action_type = \"ONS\", topic_id = oci_ons_notification_topic.ops.id, is_enabled = true } }"
          },
          {
            "name": "compartment_id",
            "required": true,
            "desc": "The OCID of the compartment to which this rule belongs.",
            "example": "var.compartment_ocid"
          },
          {
            "name": "display_name",
            "required": true,
            "desc": "A string that describes the rule.",
            "example": "\"on-bucket-create\""
          },
          {
            "name": "is_enabled",
            "required": true,
            "desc": "Whether or not this rule is currently enabled.",
            "example": "true"
          },
          {
            "name": "description",
            "required": false,
            "desc": "A string that describes the details of the rule.",
            "example": "\"Managed by Kladen\""
          }
        ],
        "nOptionalMore": 4
      },
      {
        "key": "streaming_stream",
        "name": "Stream",
        "glyph": "ST",
        "rtype": "oci_streaming_stream",
        "summary": "Kafka-compatible partitioned message stream.",
        "params": [
          {
            "name": "name",
            "required": true,
            "desc": "The name of the stream.",
            "example": "\"orders-events\""
          },
          {
            "name": "partitions",
            "required": true,
            "desc": "The number of partitions in the stream.",
            "example": "3"
          },
          {
            "name": "stream_pool_id",
            "required": false,
            "desc": "The OCID of the stream pool that contains the stream.",
            "example": "oci_streaming_stream_pool.main.id"
          },
          {
            "name": "retention_in_hours",
            "required": false,
            "desc": "The retention period of the stream, in hours.",
            "example": "24"
          }
        ],
        "nOptionalMore": 3
      }
    ]
  }
];

export const serviceByKey: Record<string, CatalogService> = Object.fromEntries(
  catalogGroups.flatMap((g) => g.items.map((s) => [s.key, s])),
);
