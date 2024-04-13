import * as THREE from "three";

export class MyScene {
  constructor() {
    this.avatars = {};

    // create a scene in which all other objects will exist
    this.scene = new THREE.Scene();

    // 将透视相机改为正交相机
    let aspect = window.innerWidth / window.innerHeight;
    let frustumSize = 10;
    this.camera = new THREE.OrthographicCamera(
      frustumSize * aspect / -2,
      frustumSize * aspect / 2,
      frustumSize / 2,
      frustumSize / -2,
      0.1,
      1000
    );
    this.camera.position.set(0, 5, 0); //调整相机位置
    this.camera.lookAt(0, 0, 0);

    // the renderer will actually show the camera view within our <canvas>
    this.renderer = new THREE.WebGLRenderer();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(this.renderer.domElement);

    // add shadows
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap; // default THREE.PCFShadowMap

    this.setupEnvironment();

    // 创建玩家对象
    this.player = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ color: 0xff0000 })
    );
    this.scene.add(this.player);

    // 监听键盘事件
    document.addEventListener("keydown", this.handleKeyDown.bind(this));
    document.addEventListener("keyup", this.handleKeyUp.bind(this));
    this.keysPressed = {};

    this.frameCount = 0;

    // 创建用于显示自己用户名的HTML元素
    this.playerLabelDiv = document.createElement('div');
    this.playerLabelDiv.className = 'user-label';
    this.playerLabelDiv.textContent = 'Me';
    document.getElementById('user-label-container').appendChild(this.playerLabelDiv);
    this.loop();
  }

  //////////////////////////////////////////////////////////////////////
  //////////////////////////////////////////////////////////////////////
  // Lighting 💡

  setupEnvironment() {
    this.scene.background = new THREE.Color(0xffaabb);

    this.scene.add(new THREE.GridHelper(100, 100));

    //add a light
    let myColor = new THREE.Color(0xffaabb);
    let ambientLight = new THREE.AmbientLight(myColor, 0.5);
    this.scene.add(ambientLight);

    // add a directional light
    let myDirectionalLight = new THREE.DirectionalLight(myColor, 0.85);
    myDirectionalLight.position.set(-5, 3, -5);
    myDirectionalLight.lookAt(0, 0, 0);
    myDirectionalLight.castShadow = true;
    this.scene.add(myDirectionalLight);

    // add a ground
    let groundGeo = new THREE.BoxGeometry(100, 0.1, 100);
    let groundMat = new THREE.MeshPhongMaterial({ color: "blue" });
    let ground = new THREE.Mesh(groundGeo, groundMat);
    ground.receiveShadow = true;
    // this.scene.add(ground);
  }

  //////////////////////////////////////////////////////////////////////
  //////////////////////////////////////////////////////////////////////
  // Player 🏃‍♂️

  handleKeyDown(event) {
    this.keysPressed[event.key] = true;
  }

  handleKeyUp(event) {
    this.keysPressed[event.key] = false;
  }

  updatePlayerPosition() {
    const speed = 0.1;

    // 根据按键输入更新玩家位置
    if (this.keysPressed["w"]) this.player.position.z -= speed;
    if (this.keysPressed["s"]) this.player.position.z += speed;
    if (this.keysPressed["a"]) this.player.position.x -= speed;
    if (this.keysPressed["d"]) this.player.position.x += speed;

    // 根据移动方向调整玩家朝向
    const direction = new THREE.Vector3();
    if (this.keysPressed["w"]) direction.z -= 1;
    if (this.keysPressed["s"]) direction.z += 1;
    if (this.keysPressed["a"]) direction.x -= 1;
    if (this.keysPressed["d"]) direction.x += 1;
    if (direction.length() > 0) {
      this.player.lookAt(this.player.position.clone().add(direction));
    }
  }

  updateCameraPosition() {
    // 计算相机相对于玩家的位置
    const cameraOffset = new THREE.Vector3(10, 10, 10);
    const cameraPosition = this.player.position.clone().add(cameraOffset);

    // 更新相机位置
    this.camera.position.copy(cameraPosition);

    // 相机始终看向玩家
    this.camera.lookAt(this.player.position);
  }

  //////////////////////////////////////////////////////////////////////
  //////////////////////////////////////////////////////////////////////
  // Peers 👫

  addPeerAvatar(id, username) {
    console.log("Adding peer avatar to 3D scene.");
    this.avatars[id] = {};

    let videoElement = document.getElementById(id + "_video");
    let videoTexture = new THREE.VideoTexture(videoElement);

    let videoMaterial = new THREE.MeshBasicMaterial({
      map: videoTexture,
      overdraw: true,
      side: THREE.DoubleSide,
    });
    let otherMat = new THREE.MeshNormalMaterial();

    let head = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), [
      otherMat,
      otherMat,
      otherMat,
      otherMat,
      otherMat,
      videoMaterial,
    ]);

    // set position of head before adding to parent object
    head.position.set(0, 0, 0);

    // 创建用于显示用户名的HTML元素
    const labelDiv = document.createElement('div');
    labelDiv.className = 'user-label';
    labelDiv.textContent = id;
    document.getElementById('user-label-container').appendChild(labelDiv);

    // add head directly to the scene
    this.scene.add(head);

    this.avatars[id] = {
      head: head,
      labelDiv: labelDiv,
    };
  }

  removePeerAvatar(id) {
    console.log("Removing peer avatar from 3D scene.");
    this.scene.remove(this.avatars[id].head);
    document.getElementById('user-label-container').removeChild(this.avatars[id].labelDiv);
    delete this.avatars[id];
  }

  updatePeerAvatars(peerInfoFromServer) {
    for (let id in peerInfoFromServer) {
      if (this.avatars[id]) {
        let pos = peerInfoFromServer[id].position;
        let rot = peerInfoFromServer[id].rotation;

        this.avatars[id].head.position.set(pos[0], pos[1], pos[2]);
        this.avatars[id].head.quaternion.set(rot[0], rot[1], rot[2], rot[3]);
      }
    }
  }

  updateClientVolumes() {
    for (let id in this.avatars) {
      let audioEl = document.getElementById(id + "_audio");
      if (audioEl && this.avatars[id].head) {
        let distSquared = this.camera.position.distanceToSquared(
          this.avatars[id].head.position
        );

        if (distSquared > 500) {
          audioEl.volume = 0;
        } else {
          // https://discourse.threejs.org/t/positionalaudio-setmediastreamsource-with-webrtc-question-not-hearing-any-sound/14301/29
          let volume = Math.min(1, 10 / distSquared);
          audioEl.volume = volume;
        }
      }
    }
  }
  updatePeerUsername(id, username) {
    if (this.avatars[id]) {
      this.avatars[id].labelDiv.textContent = username;
    }
  }
  updatePlayerUsername(username) {
    this.playerLabelDiv.textContent = username;
  }
  //////////////////////////////////////////////////////////////////////
  //////////////////////////////////////////////////////////////////////
  // Interaction 🤾‍♀️

  getPlayerPosition() {
    return [
      [this.player.position.x, this.player.position.y, this.player.position.z],
      [
        this.player.quaternion._x,
        this.player.quaternion._y,
        this.player.quaternion._z,
        this.player.quaternion._w,
      ],
    ];
  }

  //////////////////////////////////////////////////////////////////////
  //////////////////////////////////////////////////////////////////////
  // Rendering 🎥

  loop() {
    this.frameCount++;
  
    // 更新玩家和相机位置
    this.updatePlayerPosition();
    this.updateCameraPosition();
  
    // 更新自己的用户名标签位置
    const playerLabelPosition = this.player.position.clone();
    playerLabelPosition.y += 0.2;
    playerLabelPosition.project(this.camera);
  
    const playerLabelX = (playerLabelPosition.x * 0.5 + 0.5) * window.innerWidth;
    const playerLabelY = (playerLabelPosition.y * -0.5 + 0.5) * window.innerHeight;
  
    this.playerLabelDiv.style.transform = `translate(-50%, -150%) translate(${playerLabelX}px,${playerLabelY}px)`;
  
    // 更新其他玩家的用户名标签位置
    for (let id in this.avatars) {
      const avatar = this.avatars[id];
      const labelPosition = avatar.head.position.clone();
      labelPosition.y += 0.2;
      labelPosition.project(this.camera);
  
      const x = (labelPosition.x * 0.5 + 0.5) * window.innerWidth;
      const y = (labelPosition.y * -0.5 + 0.5) * window.innerHeight;
  
      avatar.labelDiv.style.transform = `translate(-50%, -150%) translate(${x}px,${y}px)`;
    }
  
    // update client volumes every 25 frames
    if (this.frameCount % 25 === 0) {
      this.updateClientVolumes();
    }
  
    this.renderer.render(this.scene, this.camera);
  
    requestAnimationFrame(() => this.loop());
  }
}