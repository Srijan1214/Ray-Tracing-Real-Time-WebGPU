import { InputManager } from "./InputManager"
import { WebGpuManager } from "./webGpuManager"
import { World } from "./world"
import { WorldStateManager } from "./WorldStateManager"

function setupControlPanelListeners(worldStateManager: WorldStateManager) {
	// FOV slider
	const fovSlider = document.getElementById("fov") as HTMLInputElement
	const fovValue = document.getElementById("fov-value") as HTMLSpanElement

	// Near and Far clip inputs
	const nearClipInput = document.getElementById(
		"near-clip"
	) as HTMLInputElement
	const farClipInput = document.getElementById("far-clip") as HTMLInputElement

	// Helper function to get current camera values
	const updateCameraProps = () => {
		worldStateManager.controlPanelUpdateCameraProps(
			fovSlider.valueAsNumber,
			nearClipInput.valueAsNumber,
			farClipInput.valueAsNumber
		)
	}

	fovSlider.addEventListener("input", (e) => {
		const value = (e.target as HTMLInputElement).value
		fovValue.textContent = `${value}°`
		updateCameraProps()
	})

	// Near clip input
	nearClipInput.addEventListener("input", (e) => {
		updateCameraProps()
	})

	// Far clip input
	farClipInput.addEventListener("input", (e) => {
		updateCameraProps()
	})

	// --- Spheres List UI ---
	const spheresList = document.getElementById("spheres-list")!
	const addSphereBtn = document.getElementById("add-sphere-btn")!
	const sphereTemplate = document.getElementById(
		"sphere-template"
	) as HTMLTemplateElement

	function renderSpheresList() {
		const spheres = worldStateManager.getSpheres()
		spheresList.innerHTML = ""
		spheres.forEach((sphere, i) => {
			if (!sphere.exists) return
			const node = sphereTemplate.content.firstElementChild!.cloneNode(
				true
			) as HTMLElement
			node.querySelector(".sphere-index")!.textContent = (
				i + 1
			).toString()
			const radiusInput = node.querySelector(
				".sphere-radius"
			) as HTMLInputElement
			const radiusValue = node.querySelector(
				".radius-value"
			) as HTMLSpanElement
			radiusInput.value = sphere.radius.toString()
			radiusValue.textContent = sphere.radius.toString()

			radiusInput.addEventListener("input", (e) => {
				const value = +(e.target as HTMLInputElement).value
				radiusValue.textContent = value.toString()
				worldStateManager.updateSphereAt(i, {
					...sphere,
					radius: value,
				})
			})

			;(["x", "y", "z"] as const).forEach((axis, idx) => {
				const posInput = node.querySelector(
					`.sphere-${axis}`
				) as HTMLInputElement
				posInput.value = sphere.center[idx].toString()
				posInput.addEventListener("input", (e) => {
					const value = +(e.target as HTMLInputElement).value
					const newCenter = [...sphere.center] as [
						number,
						number,
						number
					]
					newCenter[idx] = value
					worldStateManager.updateSphereAt(i, {
						...sphere,
						center: newCenter,
					})
					renderSpheresList()
				})
			})

						// Albedo color picker
						const albedoInput = node.querySelector(".sphere-albedo") as HTMLInputElement;
						// Convert [r,g,b] in 0-1 to hex string
						const rgbToHex = (r: number, g: number, b: number) =>
							"#" + [r, g, b].map(x => {
								const hex = Math.round(x * 255).toString(16);
								return hex.length === 1 ? "0" + hex : hex;
							}).join("");
						albedoInput.value = rgbToHex(sphere.albedo[0], sphere.albedo[1], sphere.albedo[2]);

						albedoInput.addEventListener("input", (e) => {
							const hex = (e.target as HTMLInputElement).value;
							const r = parseInt(hex.slice(1, 3), 16) / 255;
							const g = parseInt(hex.slice(3, 5), 16) / 255;
							const b = parseInt(hex.slice(5, 7), 16) / 255;
							worldStateManager.updateSphereAt(i, {
								...sphere,
								albedo: [r, g, b, 1.0],
							});
						});

						node.querySelector(".delete-sphere-btn")!.addEventListener(
								"click",
								() => {
										worldStateManager.deleteSphere(i)
										renderSpheresList()
								}
						)
						spheresList.appendChild(node)
				})
		}


	addSphereBtn.addEventListener("click", () => {
		// Default color for new sphere: use the color picker from the first template, or fallback to white
		let defaultAlbedo: [number, number, number, number] = [1.0, 1.0, 1.0, 1.0];
		const template = document.getElementById("sphere-template") as HTMLTemplateElement;
		if (template) {
			const colorInput = template.content.querySelector(".sphere-albedo") as HTMLInputElement;
			if (colorInput) {
				const hex = colorInput.value;
				const r = parseInt(hex.slice(1, 3), 16) / 255;
				const g = parseInt(hex.slice(3, 5), 16) / 255;
				const b = parseInt(hex.slice(5, 7), 16) / 255;
				defaultAlbedo = [r, g, b, 1.0];
			}
		}
		worldStateManager.addSphere(undefined, undefined, defaultAlbedo);
		renderSpheresList();
	});

	renderSpheresList()
	// ...existing code...

	// Light direction sliders
	const lightXSlider = document.getElementById("light-x") as HTMLInputElement
	const lightYSlider = document.getElementById("light-y") as HTMLInputElement
	const lightZSlider = document.getElementById("light-z") as HTMLInputElement

	const getLightDirectionValue: () => [number, number, number] = () => [
		parseFloat(lightXSlider.value),
		parseFloat(lightYSlider.value),
		parseFloat(lightZSlider.value),
	]

	lightXSlider.addEventListener("input", (e) => {
		const value = (e.target as HTMLInputElement).value
		document.getElementById("light-x-value")!.textContent = value
		worldStateManager.controlPanelUpdateDirectionalLight(
			getLightDirectionValue()
		)
	})

	lightYSlider.addEventListener("input", (e) => {
		const value = (e.target as HTMLInputElement).value
		document.getElementById("light-y-value")!.textContent = value
		worldStateManager.controlPanelUpdateDirectionalLight(
			getLightDirectionValue()
		)
	})

	lightZSlider.addEventListener("input", (e) => {
		const value = (e.target as HTMLInputElement).value
		document.getElementById("light-z-value")!.textContent = value
		worldStateManager.controlPanelUpdateDirectionalLight(
			getLightDirectionValue()
		)
	})
}

export const initMain = async () => {
	const canvas = document.querySelector("canvas") as HTMLCanvasElement
	const canvasContainer = canvas.parentElement as HTMLElement

	canvas.width = canvasContainer.clientWidth
	canvas.height = canvasContainer.clientHeight
	const webGpuManager = await WebGpuManager.initialize(canvas)
	if (!webGpuManager) {
		console.error("Failed to initialize.")
		return
	}
	const world = new World(
		webGpuManager.getDevice(),
		canvas.clientWidth,
		canvas.clientHeight
	)

	const inputManager = new InputManager(canvas)
	const worldStateManager = new WorldStateManager(world, inputManager)
	setupControlPanelListeners(worldStateManager)

	// Camera info overlay DOM elements
	const cameraPosX = document.getElementById("camera-pos-x")
	const cameraPosY = document.getElementById("camera-pos-y")
	const cameraPosZ = document.getElementById("camera-pos-z")
	const cameraDirX = document.getElementById("camera-dir-x")
	const cameraDirY = document.getElementById("camera-dir-y")
	const cameraDirZ = document.getElementById("camera-dir-z")

	// Patch the renderer's animate loop to update overlay
	const renderer = webGpuManager.getWorldRenderer(
		world,
		function patchedUpdateWorldForNextFrame(deltaTime) {
			worldStateManager.updateWorldForNextFrame(deltaTime)
			// Update camera overlay
			const camera = world.getCamera()
			if (
				cameraPosX &&
				cameraPosY &&
				cameraPosZ &&
				cameraDirX &&
				cameraDirY &&
				cameraDirZ
			) {
				cameraPosX.textContent = `x: ${camera.position[0].toFixed(2)}`
				cameraPosY.textContent = `y: ${camera.position[1].toFixed(2)}`
				cameraPosZ.textContent = `z: ${camera.position[2].toFixed(2)}`
				cameraDirX.textContent = `x: ${camera.forwardDirection[0].toFixed(
					2
				)}`
				cameraDirY.textContent = `y: ${camera.forwardDirection[1].toFixed(
					2
				)}`
				cameraDirZ.textContent = `z: ${camera.forwardDirection[2].toFixed(
					2
				)}`
			}
		}
	)

	const renderModeSelect = document.getElementById(
		"render-mode"
	) as HTMLSelectElement | null
	if (renderModeSelect) {
		renderModeSelect.value = renderer.getRenderMode()
		renderModeSelect.addEventListener("change", (e) => {
			const mode = (e.target as HTMLSelectElement).value as
				| "raster"
				| "raytrace"
			renderer.setRenderMode(mode)
		})
	}

	const showGridCheckbox = document.getElementById(
		"show-grid"
	) as HTMLInputElement | null
	if (showGridCheckbox) {
		showGridCheckbox.checked = renderer.getShowGrid()
		showGridCheckbox.addEventListener("change", (e) => {
			renderer.setShowGrid((e.target as HTMLInputElement).checked)
		})
	}

	// Listen for window resize events
	window.addEventListener("resize", () => {
		canvas.width = window.innerWidth
		canvas.height = window.innerHeight
		worldStateManager.resizeEventHandler(
			canvas.clientWidth,
			canvas.clientHeight
		)
	})

	if (!renderer) {
		console.error("Failed to initialize.")
		return
	}
	renderer.animate(Date.now())
}
