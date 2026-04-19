from flask import Flask, render_template, Response, jsonify
import cv2
import mediapipe as mp
import threading
import time

app = Flask(__name__)

# Global status to share between webcam thread and UI
current_status = {
    "warning": "",
    "details": "Initializing..."
}

# MediaPipe setup
mp_face_detection = mp.solutions.face_detection
face_detection = mp_face_detection.FaceDetection(model_selection=0, min_detection_confidence=0.5)

mp_face_mesh = mp.solutions.face_mesh
face_mesh = mp_face_mesh.FaceMesh(min_detection_confidence=0.5, min_tracking_confidence=0.5)

def get_head_pose(landmarks):
    # Very basic heuristic for head pose: distance between nose tip and left/right cheeks
    nose_tip = landmarks.landmark[1]
    left_cheek = landmarks.landmark[234]
    right_cheek = landmarks.landmark[454]
    
    # Simple ratio works for "looking away"
    dist_left = abs(nose_tip.x - left_cheek.x)
    dist_right = abs(nose_tip.x - right_cheek.x)
    
    if dist_left > dist_right * 2.5:
        return "Looking Right"
    if dist_right > dist_left * 2.5:
        return "Looking Left"
    return "Looking Forward"

def gen_frames():
    global current_status
    cap = cv2.VideoCapture(0)
    
    while True:
        success, frame = cap.read()
        if not success:
            break
        
        # Performance optimization
        frame.flags.writeable = False
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        
        # Detect faces to count
        results_det = face_detection.process(rgb_frame)
        num_faces = 0
        if results_det.detections:
            num_faces = len(results_det.detections)
            
        warning_msg = ""
        details_msg = "All good."
        
        if num_faces == 0:
            warning_msg = "NO FACE DETECTED"
            details_msg = "Please stay in front of the camera."
        elif num_faces > 1:
            warning_msg = "MULTIPLE FACES DETECTED"
            details_msg = f"{num_faces} persons detected in the frame!"
        else:
            # Check head pose since exactly one face is detected
            results_mesh = face_mesh.process(rgb_frame)
            if results_mesh.multi_face_landmarks:
                for face_landmarks in results_mesh.multi_face_landmarks:
                    pose = get_head_pose(face_landmarks)
                    if pose != "Looking Forward":
                        warning_msg = "LOOKING AWAY"
                        details_msg = f"User is {pose.lower()}."
                        break
        
        current_status['warning'] = warning_msg
        current_status['details'] = details_msg
        
        frame.flags.writeable = True
        
        # Draw warning on frame
        if warning_msg:
            cv2.putText(frame, warning_msg, (20, 40), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 255), 2)
            # Apply a red tint
            overlay = frame.copy()
            overlay[:] = (0, 0, 255)
            cv2.addWeighted(overlay, 0.2, frame, 0.8, 0, frame)
            
        ret, buffer = cv2.imencode('.jpg', frame)
        frame_bytes = buffer.tobytes()
        yield (b'--frame\r\n'
               b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/video_feed')
def video_feed():
    return Response(gen_frames(), mimetype='multipart/x-mixed-replace; boundary=frame')

@app.route('/status')
def status():
    return jsonify(current_status)

if __name__ == '__main__':
    app.run(debug=True, threaded=True, port=8000)
