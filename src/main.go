package main

import (
	"bytes"
	"context"
	"flag"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	appsv1 "k8s.io/api/apps/v1"
	apiv1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
	"k8s.io/client-go/tools/portforward"
	"k8s.io/client-go/transport/spdy"
)

func main() {
	var kubeconfig *string
	if home := homeDir(); home != "" {
		kubeconfig = flag.String("kubeconfig", filepath.Join(home, ".kube", "config"), "(optional) absolute path to the kubeconfig file")
	} else {
		kubeconfig = flag.String("kubeconfig", "", "absolute path to the kubeconfig file")
	}

	cpu := flag.String("cpu", "1", "CPU request")
	memory := flag.String("memory", "2Gi", "Memory request")
	gpu := flag.Int("gpu", 0, "GPU request (0 for none)")
	flag.Parse()

	config, err := clientcmd.BuildConfigFromFlags("", *kubeconfig)
	if (err != nil) {panic(err.Error())}

	clientset, err := kubernetes.NewForConfig(config)
	if (err != nil) {panic(err.Error())}

	fmt.Println("Successfully connected to Kubernetes cluster!")

	// Set up signal handling for cleanup
	sigs := make(chan os.Signal, 1)
	signal.Notify(sigs, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		<-sigs
		cleanup(clientset)
		os.Exit(0)
	}()

	// Create deployment and service
	createJupyterDeployment(clientset, *cpu, *memory, *gpu)
	createJupyterService(clientset)

	// Port-forwarding
	err = portForwardToJupyter(config, clientset)
	if err != nil {
		fmt.Printf("Error during port-forwarding: %v\n", err)
		cleanup(clientset)
		panic(err)
	}

	fmt.Println("Your Jupyter instance is available at http://localhost:8888")
	fmt.Println("Press Ctrl+C to exit and terminate the Jupyter instance.")

	// Wait for interruption
	select {}
}

func portForwardToJupyter(config *rest.Config, clientset *kubernetes.Clientset) error {
	// Wait for the pod to be running
	time.Sleep(10 * time.Second)

	pods, err := clientset.CoreV1().Pods(apiv1.NamespaceDefault).List(context.TODO(), metav1.ListOptions{
		LabelSelector: "app=jupyter-pod",
	})
	if err != nil {
		return err
	}
	if len(pods.Items) == 0 {
		return fmt.Errorf("no jupyter pods found")
	}
	podName := pods.Items[0].Name

	path := fmt.Sprintf("/api/v1/namespaces/%s/pods/%s/portforward", apiv1.NamespaceDefault, podName)
	hostIP := config.Host

	transport, upgrader, err := spdy.RoundTripperFor(config)
	if err != nil {
		return err
	}

	dialer := spdy.NewDialer(upgrader, &http.Client{Transport: transport}, http.MethodPost, &url.URL{Scheme: "https", Path: path, Host: hostIP})

	stopChan, readyChan := make(chan struct{}, 1), make(chan struct{}, 1)
	out, errOut := new(bytes.Buffer), new(bytes.Buffer)

	forwarder, err := portforward.New(dialer, []string{"8888:8888"}, stopChan, readyChan, out, errOut)
	if err != nil {
		return err
	}

	go func() {
		if err = forwarder.ForwardPorts(); err != nil {
			fmt.Printf("Error forwarding ports: %v\n", err)
			cleanup(clientset)
		}
	}()

	<-readyChan
	if len(errOut.String()) != 0 {
		return fmt.Errorf("port forwarding error: %s", errOut.String())
	}

	return nil
}

func createJupyterDeployment(clientset *kubernetes.Clientset, cpu, memory string, gpu int) {
	deploymentsClient := clientset.AppsV1().Deployments(apiv1.NamespaceDefault)

	deployment := &appsv1.Deployment{
		ObjectMeta: metav1.ObjectMeta{
			Name: "jupyter-deployment",
		},
		Spec: appsv1.DeploymentSpec{
			Replicas: int32Ptr(1),
			Selector: &metav1.LabelSelector{
				MatchLabels: map[string]string{
					"app": "jupyter-pod",
				},
			},
			Template: apiv1.PodTemplateSpec{
				ObjectMeta: metav1.ObjectMeta{
					Labels: map[string]string{
						"app": "jupyter-pod",
					},
				},
				Spec: apiv1.PodSpec{
					Containers: []apiv1.Container{
						{
							Name:  "jupyter-container",
							Image: "jupyter/base-notebook:latest",
							Ports: []apiv1.ContainerPort{
								{
									Name:          "http",
									Protocol:      apiv1.ProtocolTCP,
									ContainerPort: 8888,
								},
							},
							Resources: apiv1.ResourceRequirements{
								Requests: apiv1.ResourceList{
									apiv1.ResourceCPU:    resource.MustParse(cpu),
									apiv1.ResourceMemory: resource.MustParse(memory),
								},
								Limits: apiv1.ResourceList{
									apiv1.ResourceCPU:    resource.MustParse(cpu),
									apiv1.ResourceMemory: resource.MustParse(memory),
								},
							},
						},
					},
				},
			},
		},
	}

	if gpu > 0 {
		deployment.Spec.Template.Spec.Containers[0].Resources.Limits["nvidia.com/gpu"] = resource.MustParse(fmt.Sprintf("%d", gpu))
	}

	fmt.Println("Creating deployment...")
	result, err := deploymentsClient.Create(context.TODO(), deployment, metav1.CreateOptions{})
	if err != nil {
		panic(err)
	}
	fmt.Printf("Created deployment %q.\n", result.GetObjectMeta().GetName())
}

func createJupyterService(clientset *kubernetes.Clientset) {
	serviceClient := clientset.CoreV1().Services(apiv1.NamespaceDefault)
	service := &apiv1.Service{
		ObjectMeta: metav1.ObjectMeta{
			Name: "jupyter-service",
		},
		Spec: apiv1.ServiceSpec{
			Selector: map[string]string{
				"app": "jupyter-pod",
			},
			Ports: []apiv1.ServicePort{
				{
					Name:     "http",
					Protocol: apiv1.ProtocolTCP,
					Port:     8888,
				},
			},
			Type: apiv1.ServiceTypeClusterIP,
		},
	}

	fmt.Println("Creating service...")
	result, err := serviceClient.Create(context.TODO(), service, metav1.CreateOptions{})
	if err != nil {
		panic(err)
	}
	fmt.Printf("Created service %q.\n", result.GetObjectMeta().GetName())
}

func cleanup(clientset *kubernetes.Clientset) {
	fmt.Println("Cleaning up resources...")
	deploymentsClient := clientset.AppsV1().Deployments(apiv1.NamespaceDefault)
	_ = deploymentsClient.Delete(context.TODO(), "jupyter-deployment", metav1.DeleteOptions{})

	serviceClient := clientset.CoreV1().Services(apiv1.NamespaceDefault)
	_ = serviceClient.Delete(context.TODO(), "jupyter-service", metav1.DeleteOptions{})
	fmt.Println("Cleanup complete.")
}

func homeDir() string {
	if h := os.Getenv("HOME"); h != "" {
		return h
	}
	return os.Getenv("USERPROFILE") // windows
}

func int32Ptr(i int32) *int32 { return &i }
